"""独立参考图工作台；页面契约与 Naumi 发布周期分离，数据只存本服务。"""
import asyncio
import base64
import hashlib
import hmac
import io
import ipaddress
import json
import os
import math
from pathlib import Path, PurePosixPath
import secrets
import socket
import sqlite3
import time
from urllib.parse import urlsplit
import zipfile
from contextlib import asynccontextmanager

import httpx
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from PIL import Image, ImageOps

HERE = Path(__file__).parent
DATA = Path(os.environ.get('WORKBENCH_DATA', HERE / 'data')).resolve()
DATA.mkdir(parents=True, exist_ok=True)
KEY_FILE = DATA / 'master.key'
if not KEY_FILE.exists():
    KEY_FILE.write_bytes(Fernet.generate_key())
    KEY_FILE.chmod(0o600)
CIPHER = Fernet(KEY_FILE.read_bytes())
DB_FILE = DATA / 'workbench.sqlite'
DEFAULT_PROMPT = '根据图一产品，参考图二的风格与设计理念，用你的专业知识去排版规划，生成类似风格的图片'
DEFAULT_INSTRUCTION = '图一是我们的产品图，图二是同行参考图。请分析图二的构图、排版、配色、场景、光影、卖点和视觉风格，保留图一产品主体特征，输出中文图生图提示词。不要复用商标、水印和联系方式。'
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.jfif'}
MODES = {'all_sku': {'main', 'detail', 'sku'}, 'all': {'main', 'detail'}, 'main_detail': {'main', 'detail'}, 'main': {'main'}, 'detail': {'detail'}, 'sku': {'sku'}}
LABELS = {'main': '主图', 'detail': '详情图', 'sku': 'SKU'}
CLIENT = None
WAKE = asyncio.Event()
LOGIN_ATTEMPTS = {}
SLOT = os.environ.get('WORKBENCH_SLOT', 'local')
WAITING_STATE = 'waiting_geometry_v1'


def image_geometry(path):
    with Image.open(path) as image:
        width, height = ImageOps.exif_transpose(image).size
    return {'width': width, 'height': height}


def geometry_plan(reference, resolution):
    """最终画布精确等于参考图；上游请求按分辨率等比放大，不请求方图。"""
    width, height = reference['width'], reference['height']
    long_side = {'1k': 1024, '2k': 2048, '4k': 4096}[resolution]
    # 图像API尺寸按16像素量化；提示词补充原始比例，回传严格验证。
    factor = long_side / max(width, height)
    upstream_width = max(64, round(width * factor / 16) * 16)
    upstream_height = max(64, round(height * factor / 16) * 16)
    divisor = math.gcd(width, height)
    return {'width': width, 'height': height, 'ratio': f'{width//divisor}:{height//divisor}', 'size': f'{upstream_width}x{upstream_height}', 'policy': 'reference-exact-v1'}


def preserve_geometry(image, geometry):
    """等比缩放并居中放入参考画布，绝不把长方图拉成方图；大比例偏差拒收。"""
    width, height = geometry['width'], geometry['height']
    natural = ImageOps.exif_transpose(image).convert('RGBA')
    expected = width / height
    actual = natural.width / natural.height
    if abs(actual / expected - 1) > .035:
        raise HTTPException(502, f'上游返回比例与参考图不一致（{natural.width}×{natural.height}，参考{width}×{height}）；已保留返回图待核对，未拉伸或自动重发')
    if natural.size == (width, height):
        return natural
    resized = ImageOps.contain(natural, (width, height), Image.Resampling.LANCZOS)
    if resized.size == (width, height):
        return resized
    canvas = Image.new('RGBA', (width, height), (255, 255, 255, 255))
    canvas.alpha_composite(resized, ((width-resized.width)//2, (height-resized.height)//2))
    return canvas


def db():
    c = sqlite3.connect(DB_FILE, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def password_hash(value, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(value.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()


def initialize():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT UNIQUE, password TEXT, admin INTEGER);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires REAL);
        CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, name TEXT, base TEXT, secret TEXT, models TEXT DEFAULT '[]', image_model TEXT, text_model TEXT, discovered REAL, active INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, root TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, ref TEXT, kind TEXT, operation TEXT, prompt TEXT, config TEXT, channel TEXT, state TEXT, error TEXT DEFAULT '', created REAL, updated REAL, result TEXT DEFAULT '', source TEXT DEFAULT '', annotated TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS worker_owners (task_id TEXT PRIMARY KEY,slot TEXT,pid INTEGER,claimed REAL);
        ''')
        if not c.execute('SELECT 1 FROM users').fetchone():
            name, password = os.environ.get('WORKBENCH_ADMIN_USER'), os.environ.get('WORKBENCH_ADMIN_PASSWORD')
            if name and password:
                c.execute('INSERT INTO users VALUES (?,?,?,1)', (secrets.token_hex(12), name, password_hash(password)))
        # 重启后的未知上游提交不自动重发，保留证据让管理员核对。
        if os.environ.get('WORKBENCH_RECOVER', '1') == '1':
            c.execute("UPDATE tasks SET state='maybe_submitted', error='服务重启，提交结果待核对；未自动重发' WHERE state IN ('running','editing','inferring')")


initialize()


def user(request, admin=False):
    token = request.cookies.get('wb_session', '')
    with db() as c:
        row = c.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    if not row:
        raise HTTPException(401, '请先登录')
    if admin and not row['admin']:
        raise HTTPException(403, '需要管理员账号')
    return dict(row)


def owned_project(uid, root):
    with db() as c:
        row = c.execute('SELECT * FROM projects WHERE id=? AND user_id=?', (root, uid)).fetchone()
    if not row:
        raise HTTPException(404, '产品文件夹不存在')
    return dict(row)


def owned_path(uid, relative):
    p = (DATA / str(relative)).resolve()
    try:
        parts = p.relative_to(DATA / 'users' / uid).parts
    except ValueError:
        raise HTTPException(403, '图片不属于当前账号')
    if not parts or p.suffix.lower() not in EXTENSIONS:
        raise HTTPException(400, '无效图片路径')
    return p


def image_url(relative):
    from urllib.parse import quote
    return '/api/image?path=' + quote(str(relative), safe='')


def valid_image(raw):
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, '单张图片超过20MB')
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im.verify()
    except Exception:
        raise HTTPException(400, '图片内容无效')


def classify(path, sku='SKU'):
    directories = [x.lower() for x in PurePosixPath(path).parts[:-1]]
    if any(x in {sku.lower(), 'sku'} for x in directories):
        return 'sku'
    if any(x in {'详情图', '详情', 'detail', 'details'} for x in directories):
        return 'detail'
    if any(x in {'主图', 'main', '主图参考', '参考图', 'refs', 'references'} for x in directories):
        return 'main'
    if any(x in {'产品图', '产品', '原图', 'product', 'products', 'source'} for x in directories):
        return 'product'
    if len(directories) == 0:
        return 'product'
    return 'main'


def project_items(uid, root, config):
    project = owned_project(uid, root)
    folder = DATA / project['root']
    manifest = json.loads((folder / 'manifest.json').read_text('utf-8'))
    sku = config.get('sku_refs_dir_name', 'SKU')
    entries = [(x, classify(x['relative'], sku)) for x in manifest]
    products = [x for x, kind in entries if kind == 'product']
    refs = [(x, kind) for x, kind in entries if kind != 'product' and kind in MODES.get(config.get('mode', 'main_detail'), {'main', 'detail'})]
    if not products:
        raise HTTPException(400, '根目录或产品图文件夹中需要至少一张产品图')
    with db() as c:
        tasks = [dict(x) for x in c.execute('SELECT * FROM tasks WHERE user_id=? AND project_id=? ORDER BY created DESC', (uid, root))]
    result = []
    for entry, kind in refs:
        histories = [x for x in tasks if x['ref'] == entry['path']]
        generations = [x for x in histories if x['operation'] != 'infer']
        infer = next((x for x in histories if x['operation'] == 'infer'), None)
        versions = []
        for t in reversed(generations):
            if not t['result']:
                continue
            versions.append({'path': t['result'], 'url': image_url(t['result']), 'mtime': t['updated'], 'label': 'V' + str(len(versions)+1), 'meta': {'kind': t['operation'], 'prompt': t['prompt'], 'status': t['state'], 'source_path': t['source'], 'annotated_path': t['annotated'], 'annotated_url': image_url(t['annotated']) if t['annotated'] else '', 'created_at': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(t['created'])), 'geometry': json.loads(t['config']).get('geometry')}})
        current = generations[0] if generations else None
        state = current['state'] if current else 'idle'
        if state == WAITING_STATE:
            state = 'waiting'
        if infer and infer['state'] in {'waiting', WAITING_STATE, 'inferring'}:
            state = 'inferring'
        prompt = config.get('prompt', DEFAULT_PROMPT)
        if infer and infer['state'] == 'done':
            prompt = infer['result']
        dimensions = image_geometry(DATA / entry['path'])
        result.append({'ref_path': entry['path'], 'ref_name': entry['relative'], 'ref_url': image_url(entry['path']), 'product': project['name'], 'product_images': [x['relative'] for x in products], 'product_urls': [image_url(x['path']) for x in products], 'product_url': image_url(products[0]['path']), 'product_image': products[0]['relative'], 'task_label': LABELS[kind], 'kind': kind, 'size': f"{dimensions['width']}×{dimensions['height']}", 'dimensions': dimensions, 'status': state, 'error': current['error'] if current else '', 'prompt': prompt, 'versions': versions, 'infer': {'status': 'inferring' if infer and infer['state'] in {'waiting', WAITING_STATE, 'inferring'} else (infer['state'] if infer else 'idle'), 'prompt': infer['result'] if infer and infer['state'] == 'done' else '', 'error': infer['error'] if infer else ''}})
    return result, products


async def checked_origin(base):
    base = str(base).rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(400, '上游地址须为不含凭据的HTTPS地址')
    try:
        addresses = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, parsed.port or 443)
        if any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):
            raise HTTPException(400, '上游地址须使用公开供应商域名')
    except socket.gaierror:
        raise HTTPException(400, '上游域名解析失败')
    return base


def channel_record(channel_id=None):
    with db() as c:
        row = c.execute('SELECT * FROM channels WHERE id=?', (channel_id,)).fetchone() if channel_id else c.execute('SELECT * FROM channels WHERE active=1').fetchone()
    if not row:
        raise HTTPException(400, '请先在管理系统配置并启用上游渠道')
    return dict(row)


def sanitized_channel(ch):
    return {k: v for k, v in ch.items() if k != 'secret'} | {'has_api_key': bool(ch['secret']), 'models': json.loads(ch['models'] or '[]')}


def freeze_channel(ch):
    return CIPHER.encrypt(json.dumps(ch).encode()).decode()


async def upstream(ch, endpoint, **kwargs):
    base = await checked_origin(ch['base'])
    key = CIPHER.decrypt(ch['secret'].encode()).decode()
    headers = dict(kwargs.pop('headers', {}))
    headers['Authorization'] = 'Bearer ' + key
    response = await CLIENT.request(kwargs.pop('method', 'POST'), base + endpoint, headers=headers, follow_redirects=False, **kwargs)
    if not response.is_success:
        # 原始供应商错误可能包含密钥/内部信息，仅回传白名单状态码。
        raise HTTPException(502, '上游请求失败：HTTP ' + str(response.status_code))
    return response


def data_url(path):
    raw = path.read_bytes()
    with Image.open(io.BytesIO(raw)) as im:
        mime = Image.MIME[im.format]
    return 'data:' + mime + ';base64,' + base64.b64encode(raw).decode()


async def execute_task(t):
    cfg = json.loads(t['config'])
    ch = json.loads(CIPHER.decrypt(t['channel'].encode()))
    state = {'infer': 'inferring', 'edit': 'editing'}.get(t['operation'], 'running')
    with db() as c:
        c.execute('UPDATE tasks SET state=?,updated=? WHERE id=?', (state, time.time(), t['id']))
    try:
        _, products = project_items(t['user_id'], t['project_id'], cfg)
        if t['operation'] == 'infer':
            model = ch['text_model']
            if not model:
                raise HTTPException(400, '渠道尚未选择提示词推理模型')
            paths = [DATA / x['path'] for x in products[:4]] + [DATA / t['ref']]
            content = [{'type': 'text', 'text': cfg.get('prompt_infer_instruction') or DEFAULT_INSTRUCTION}]
            content += [{'type': 'image_url', 'image_url': {'url': data_url(p)}} for p in paths]
            response = await upstream(ch, '/chat/completions', json={'model': model, 'messages': [{'role': 'user', 'content': content}], 'max_tokens': 900}, timeout=cfg['timeout'])
            text = response.json()['choices'][0]['message']['content']
            if not isinstance(text, str) or not text.strip():
                raise HTTPException(502, '推理未返回提示词')
            result = text.strip()
        else:
            if not ch['image_model']:
                raise HTTPException(400, '渠道尚未选择生图模型')
            paths = [DATA / t['source'], DATA / t['annotated']] if t['operation'] == 'edit' else [DATA / x['path'] for x in products[:6]] + [DATA / t['ref']]
            files = []
            for i, p in enumerate(paths):
                raw = p.read_bytes()
                with Image.open(io.BytesIO(raw)) as im:
                    mime = Image.MIME[im.format]
                files.append(('image[]', (f'image-{i}' + p.suffix, raw, mime)))
            geometry = cfg.get('geometry') or geometry_plan(image_geometry(DATA / t['ref']), cfg['resolution'])
            shape_prompt = f"\n最终画布遵循参考图比例{geometry['ratio']}（参考宽{geometry['width']}像素，高{geometry['height']}像素）。完整保留参考图纵向/横向版式与产品比例，不压缩、不拉伸、不强制方形。"
            params = {'model': ch['image_model'], 'prompt': t['prompt'] + shape_prompt, 'n': '1', 'response_format': 'b64_json', 'size': geometry['size'], 'quality': cfg['quality']}
            response = await upstream(ch, '/images/edits', files=files, data=params, timeout=cfg['timeout'])
            rows = response.json().get('data', [])
            if not rows:
                raise HTTPException(502, '上游未返回可验证的图片')
            first = rows[0]
            if first.get('b64_json'):
                raw = base64.b64decode(first['b64_json'], validate=True)
            elif first.get('url'):
                remote = first['url']
                await checked_origin('https://' + urlsplit(remote).netloc)
                if urlsplit(remote).scheme != 'https':
                    raise HTTPException(502, '图片下载地址无效')
                # 不将上游Bearer发送给返回的图片主机。
                async with CLIENT.stream('GET', remote, follow_redirects=False, timeout=90) as downloaded:
                    downloaded.raise_for_status()
                    parts = []
                    total = 0
                    async for chunk in downloaded.aiter_bytes():
                        total += len(chunk)
                        if total > 20 * 1024 * 1024:
                            raise HTTPException(502, '上游图片过大')
                        parts.append(chunk)
                    raw = b''.join(parts)
            else:
                raise HTTPException(502, '上游未返回图片字节或地址')
            valid_image(raw)
            project = owned_project(t['user_id'], t['project_id'])
            output = DATA / project['root'] / 'results' / (t['id'] + '.png')
            output.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(io.BytesIO(raw)) as im:
                # 保存原始供应商返回证据；异常比例不进入可交付版本。
                im.save(output.with_name('received-' + output.name), 'PNG')
                preserve_geometry(im, geometry).save(output, 'PNG')
            result = output.relative_to(DATA).as_posix()
        with db() as c:
            c.execute("UPDATE tasks SET state='done',result=?,updated=? WHERE id=?", (result, time.time(), t['id']))
    except Exception as e:
        # 传输中断可能已收费；既不自动重试，也不将其标成明确未提交。
        unknown = isinstance(e, (httpx.TimeoutException, httpx.NetworkError))
        error = '提交结果未知，请核对上游后处理；未自动重发' if unknown else (str(e.detail) if isinstance(e, HTTPException) else '上游结果处理失败，请查看渠道与任务记录')
        with db() as c:
            c.execute('UPDATE tasks SET state=?,error=?,updated=? WHERE id=?', ('maybe_submitted' if unknown else 'failed', error, time.time(), t['id']))


async def worker():
    while True:
        if (DATA / ('drain-' + SLOT)).exists():
            await asyncio.sleep(1)
            continue
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            active = c.execute("SELECT count(*) FROM tasks WHERE state IN ('running','editing','inferring')").fetchone()[0]
            row = c.execute('SELECT * FROM tasks WHERE state=? ORDER BY created LIMIT 1', (WAITING_STATE,)).fetchone() if active < 2 else None
            if row:
                c.execute("UPDATE tasks SET state='running' WHERE id=? AND state=?", (row['id'], WAITING_STATE))
                c.execute('INSERT OR REPLACE INTO worker_owners VALUES (?,?,?,?)', (row['id'], SLOT, os.getpid(), time.time()))
        if row:
            await execute_task(dict(row))
        else:
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app):
    global CLIENT
    CLIENT = httpx.AsyncClient(trust_env=False, limits=httpx.Limits(max_connections=8), timeout=30)
    workers = [asyncio.create_task(worker()) for _ in range(2)] if os.environ.get('WORKBENCH_WORKERS', '1') == '1' else []
    yield
    for w in workers:
        w.cancel()
    await asyncio.gather(*workers, return_exceptions=True)
    await CLIENT.aclose()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware('http')
async def origin_check(request, call_next):
    origin = request.headers.get('origin')
    if request.method not in {'GET', 'HEAD', 'OPTIONS'} and origin and urlsplit(origin).netloc != request.headers.get('host'):
        return JSONResponse({'error': '来源不匹配'}, 403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/health')
async def health():
    return {'ok': True, 'service': 'reference-workbench', 'version': os.environ.get('WORKBENCH_VERSION', 'dev')}


@app.get('/')
async def root():
    return RedirectResponse('/workbench')


@app.get('/workbench')
@app.get('/batchshot')
async def page(request: Request):
    try:
        user(request)
    except HTTPException:
        return RedirectResponse('/login')
    return HTMLResponse((HERE / 'static/workbench.html').read_text('utf-8'))


@app.get('/login')
async def login_page():
    return HTMLResponse((HERE / 'static/login.html').read_text('utf-8'))


@app.post('/api/auth/login')
async def login(request: Request):
    address = request.client.host
    recent = [x for x in LOGIN_ATTEMPTS.get(address, []) if x > time.time()-600]
    if len(recent) >= 15:
        raise HTTPException(429, '登录过于频繁，请稍后重试')
    recent.append(time.time())
    LOGIN_ATTEMPTS[address] = recent
    body = await request.json()
    with db() as c:
        row = c.execute('SELECT * FROM users WHERE name=?', (str(body.get('username', '')),)).fetchone()
        if not row or not hmac.compare_digest(row['password'], password_hash(str(body.get('password', '')), row['password'].split(':')[0])):
            raise HTTPException(401, '账号或密码错误')
        token = secrets.token_urlsafe(32)
        c.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), row['id'], time.time()+86400*7))
    response = JSONResponse({'ok': True})
    response.set_cookie('wb_session', token, httponly=True, samesite='lax', secure=request.url.scheme == 'https', max_age=86400*7)
    return response


@app.post('/api/auth/logout')
async def logout(request: Request):
    with db() as c:
        c.execute('DELETE FROM sessions WHERE token=?', (hashlib.sha256(request.cookies.get('wb_session', '').encode()).hexdigest(),))
    response = JSONResponse({'ok': True})
    response.delete_cookie('wb_session')
    return response


@app.get('/api/auth/status')
async def auth_status(request: Request):
    u = user(request)
    return {'ok': True, 'username': u['name'], 'admin': bool(u['admin'])}


@app.get('/api/heartbeat')
async def heartbeat(request: Request):
    user(request)
    return {'ok': True}


@app.get('/api/settings')
async def settings(request: Request):
    u = user(request)
    return {'mode': 'all', 'quality': 'high', 'resolution': '2k', 'timeout': 900, 'sku_refs_dir_name': 'SKU', 'force': False, 'card_height': 640, 'prompt': DEFAULT_PROMPT, 'prompt_infer_instruction': DEFAULT_INSTRUCTION, 'settings_editable': bool(u['admin']), 'provider_templates': []}


@app.post('/api/workbench/upload-folder')
async def upload(request: Request):
    u = user(request)
    form = await request.form(max_files=500, max_fields=4, max_part_size=20*1024*1024)
    try:
        manifest = json.loads(form.get('manifest', '[]'))
    except Exception:
        raise HTTPException(400, '文件清单无效')
    files = form.getlist('files')
    if not manifest or len(manifest) != len(files) or len(files) > 500:
        raise HTTPException(400, '文件清单与上传数量不匹配')
    pid = secrets.token_hex(12)
    folder = DATA / 'users' / u['id'] / pid
    saved = []
    total = 0
    seen = set()
    root_name = PurePosixPath(str(manifest[0].get('path', '')).replace('\\', '/')).parts[0]
    for entry, f in zip(manifest, files):
        p = PurePosixPath(str(entry.get('path', '')).replace('\\', '/'))
        if not p.parts or p.is_absolute() or '..' in p.parts or any(':' in x or len(x) > 160 for x in p.parts):
            raise HTTPException(400, '文件路径无效')
        relative = PurePosixPath(*p.parts[1:]) if len(p.parts) > 1 else p
        if str(relative) in seen or relative.suffix.lower() not in EXTENSIONS:
            raise HTTPException(400, '重复路径或无效图片类型')
        seen.add(str(relative))
        raw = await f.read(20*1024*1024+1)
        total += len(raw)
        if total > 300*1024*1024:
            raise HTTPException(413, '产品文件夹超过300MB')
        valid_image(raw)
        saved.append((relative, raw))
    records = []
    for relative, raw in saved:
        target = folder / 'source' / str(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        records.append({'relative': str(relative), 'path': target.relative_to(DATA).as_posix()})
    (folder / 'manifest.json').write_text(json.dumps(records, ensure_ascii=False), 'utf-8')
    with db() as c:
        project_id = pid + '/' + root_name
        c.execute('INSERT INTO projects VALUES (?,?,?,?,?)', (project_id, u['id'], root_name, folder.relative_to(DATA).as_posix(), time.time()))
    return {'ok': True, 'product_dir': project_id, 'saved': len(records), 'skipped': 0}


@app.get('/api/workbench/items')
async def items(request: Request):
    u = user(request)
    cfg = dict(request.query_params)
    root = cfg.get('root', '')
    if not root:
        return {'items': []}
    rows, _ = project_items(u['id'], root, cfg)
    return {'items': rows}


def validate_config(config):
    cfg = {k: v for k, v in config.items() if k in {'mode', 'quality', 'resolution', 'timeout', 'sku_refs_dir_name', 'prompt', 'prompt_infer_instruction', 'force'}}
    if cfg.get('quality', 'high') not in {'high', 'medium', 'low', 'auto'} or cfg.get('resolution', '2k') not in {'1k', '2k', '4k'} or cfg.get('mode', 'main_detail') not in MODES:
        raise HTTPException(400, '生图参数无效')
    cfg.setdefault('quality', 'high')
    cfg.setdefault('resolution', '2k')
    cfg.setdefault('mode', 'main_detail')
    try:
        cfg['timeout'] = int(cfg.get('timeout', 900))
    except (ValueError, TypeError):
        raise HTTPException(400, '等待秒数无效')
    if cfg['timeout'] not in {600, 900, 1200, 1800}:
        raise HTTPException(400, '等待秒数无效')
    return cfg


async def enqueue(request, operation):
    u = user(request)
    body = await request.json()
    cfg = validate_config(body.get('config', {}))
    request_id = body.get('request_id')
    if request_id is not None:
        if not isinstance(request_id, str) or not 8 <= len(request_id) <= 128:
            raise HTTPException(400, '请求标识无效')
        cfg['request_id'] = request_id
    root = body.get('workbench_root', '')
    rows, _ = project_items(u['id'], root, cfg)
    index = {x['ref_path']: x for x in rows}
    requested = body.get('items', []) if operation != 'edit' else [body]
    if not requested or len(requested) > 500:
        raise HTTPException(400, '请先选择参考图')
    ch = channel_record()
    snapshot = freeze_channel(ch)
    accepted, skipped = [], 0
    # 一个事务下判重与入队，双击/并发请求不会创建重复收费任务。
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        for x in requested:
            ref = x.get('ref_path')
            if ref not in index:
                raise HTTPException(400, '选择的参考图不属于当前产品文件夹')
            item = index[ref]
            if request_id and c.execute("SELECT 1 FROM tasks WHERE user_id=? AND ref=? AND json_extract(config,'$.request_id')=?", (u['id'], ref, request_id)).fetchone():
                skipped += 1
                continue
            pending = c.execute("SELECT id FROM tasks WHERE user_id=? AND ref=? AND state IN ('waiting','waiting_geometry_v1','running','editing','inferring','maybe_submitted')", (u['id'], ref)).fetchone()
            if pending:
                skipped += 1
                continue
            prompt = str(x.get('prompt') or cfg.get('prompt') or DEFAULT_PROMPT).strip()
            if not prompt or len(prompt) > 12000:
                raise HTTPException(400, '提示词无效')
            source = annotated = ''
            if operation == 'edit':
                source = str(body.get('result_path', ''))
                if source not in {v['path'] for v in item['versions']}:
                    raise HTTPException(400, '所选版本不属于当前卡片')
                try:
                    raw = base64.b64decode(body.get('annotated_data_url', '').split(',', 1)[1], validate=True)
                except Exception:
                    raise HTTPException(400, '标注图无效')
                valid_image(raw)
                folder = owned_path(u['id'], source).parent
                target = folder / ('annotation-' + secrets.token_hex(12) + '.png')
                target.write_bytes(raw)
                annotated = target.relative_to(DATA).as_posix()
            tid = secrets.token_hex(16)
            now = time.time()
            frozen = cfg | {'geometry': geometry_plan(item['dimensions'], cfg['resolution'])}
            c.execute('INSERT INTO tasks (id,user_id,project_id,ref,kind,operation,prompt,config,channel,state,created,updated,source,annotated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (tid, u['id'], root, ref, item['kind'], operation, prompt, json.dumps(frozen, ensure_ascii=False), snapshot, WAITING_STATE, now, now, source, annotated))
            accepted.append(tid)
    return {'ok': True, 'accepted': len(accepted), 'skipped': skipped, 'task_ids': accepted}


@app.post('/api/workbench/start')
async def start(request: Request):
    result = await enqueue(request, 'generate')
    return Response(f"已提交 {result['accepted']} 个任务，跳过 {result['skipped']} 个。", media_type='text/plain')


@app.post('/api/workbench/infer-prompts')
async def infer(request: Request):
    return await enqueue(request, 'infer')


@app.post('/api/workbench/edit')
async def edit(request: Request):
    return await enqueue(request, 'edit')


@app.get('/api/status')
async def status(request: Request):
    u = user(request)
    with db() as c:
        counts = dict(c.execute('SELECT state,count(*) FROM tasks WHERE user_id=? GROUP BY state', (u['id'],)))
        counts['waiting'] = counts.get('waiting', 0) + counts.get(WAITING_STATE, 0)
        latest = c.execute('SELECT t.*,p.name AS product_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.user_id=? ORDER BY t.updated DESC LIMIT 1', (u['id'],)).fetchone()
        image_counts = dict(c.execute("SELECT state,count(*) FROM tasks WHERE user_id=? AND operation!='infer' GROUP BY state", (u['id'],)))
    running = sum(counts.get(x, 0) for x in ['running', 'editing', 'inferring'])
    names = {'done': '完成', 'waiting': '等待中', 'running': '生成中', 'editing': '二次修改中', 'inferring': '推理中', 'failed': '失败', 'maybe_submitted': '提交待核对'}
    return {'running': bool(running or counts.get('waiting')), 'progress': {'current': names.get(latest['state'], latest['state']) if latest else '等待', 'product': latest['product_name'] if latest else '', 'size': json.loads(latest['config']).get('resolution', '') if latest else '', 'ref': Path(latest['ref']).name if latest else '', 'done': image_counts.get('done', 0), 'failed': counts.get('failed', 0), 'last_error': latest['error'] if latest else ''}, 'queue': {'running': running, 'waiting': counts.get('waiting', 0), 'global_limit': 2, 'user_limit': 2}}


@app.get('/api/image')
async def image(request: Request, path: str, download: int = 0):
    u = user(request)
    target = owned_path(u['id'], path)
    if not target.is_file():
        raise HTTPException(404, '图片不存在')
    return FileResponse(target, filename=target.name if download else None)


@app.post('/api/workbench/download-zip')
@app.post('/api/images-zip')
async def download(request: Request):
    u = user(request)
    body = await request.json()
    paths = []
    if request.url.path.endswith('images-zip'):
        paths = body.get('paths', [])
    else:
        rows, _ = project_items(u['id'], body.get('workbench_root', ''), body.get('config', {}))
        by_ref = {r['ref_path']: r for r in rows}
        for entry in body.get('items', []):
            item = by_ref.get(entry.get('ref_path'))
            if not item:
                raise HTTPException(400, '卡片不属于当前产品')
            if body.get('include_original'):
                paths.append(item['ref_path'])
            if body.get('include_generated') and entry.get('version_path'):
                if entry['version_path'] not in {v['path'] for v in item['versions']}:
                    raise HTTPException(400, '生成图不属于当前卡片')
                paths.append(entry['version_path'])
    if not paths or len(paths) > 1000:
        raise HTTPException(400, '没有可下载图片')
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        for i, relative in enumerate(dict.fromkeys(paths)):
            target = owned_path(u['id'], relative)
            if not target.is_file():
                raise HTTPException(404, '图片不存在')
            z.write(target, f'{i+1:03d}_{target.name}')
    return Response(buffer.getvalue(), media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="workbench-images.zip"'})


@app.get('/admin')
async def admin_page(request: Request):
    user(request, True)
    return HTMLResponse((HERE / 'static/admin.html').read_text('utf-8'))


@app.get('/api/admin/channels')
async def channels(request: Request):
    user(request, True)
    with db() as c:
        rows = [sanitized_channel(dict(x)) for x in c.execute('SELECT * FROM channels ORDER BY name')]
    return {'channels': rows}


@app.post('/api/admin/channels')
async def save_channel(request: Request):
    user(request, True)
    body = await request.json()
    base = await checked_origin(body.get('base', ''))
    cid = body.get('id') or secrets.token_hex(12)
    with db() as c:
        old = c.execute('SELECT * FROM channels WHERE id=?', (cid,)).fetchone()
    key = str(body.get('api_key', '')).strip()
    secret = CIPHER.encrypt(key.encode()).decode() if key else (old['secret'] if old else '')
    if not secret:
        raise HTTPException(400, '请填写API Key')
    proposed = {'base': base, 'secret': secret}
    discovered = await upstream(proposed, '/models', method='GET')
    rows = discovered.json().get('data', [])
    models = list(dict.fromkeys(str(r['id']) for r in rows if isinstance(r, dict) and r.get('id')))
    if not models:
        raise HTTPException(502, '目录接口未返回模型；原配置未改变')
    image_model = str(body.get('image_model', old['image_model'] if old else ''))
    text_model = str(body.get('text_model', old['text_model'] if old else ''))
    if any(m and m not in models for m in [image_model, text_model]):
        raise HTTPException(400, '选择的模型不在本密钥可见目录中')
    name = str(body.get('name', '新渠道')).strip()[:100]
    active = bool(body.get('active', False))
    with db() as c:
        if active:
            c.execute('UPDATE channels SET active=0')
        c.execute('INSERT INTO channels VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base=excluded.base,secret=excluded.secret,models=excluded.models,image_model=excluded.image_model,text_model=excluded.text_model,discovered=excluded.discovered,active=excluded.active', (cid, name, base, secret, json.dumps(models), image_model, text_model, time.time(), int(active)))
    return {'ok': True, 'channel': sanitized_channel(channel_record(cid)), 'discovery': 'key-visible-directory; generation-not-yet-verified'}


@app.get('/api/admin/tasks')
async def admin_tasks(request: Request):
    user(request, True)
    with db() as c:
        rows = [dict(x) for x in c.execute('SELECT id,user_id,operation,state,error,created,updated FROM tasks ORDER BY created DESC LIMIT 200')]
    return {'tasks': rows}
