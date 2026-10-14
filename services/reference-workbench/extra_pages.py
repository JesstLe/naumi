"""单图/聊天页面的本站持久协议；复用全局渠道、账号私有素材与共享Worker。"""
import base64
import io
import json
import re
import secrets
import time

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from PIL import Image


RATIOS = {'1:1', '3:4', '4:3', '9:16', '16:9', '1:2', '2:1', '2:3', '3:2', '1:3', '3:1'}
BUSY = {'waiting_extra_v1', 'running', 'editing', 'inferring'}
UNKNOWN = 'maybe_submitted'
PLAN_INSTRUCTION = '''你是电商图片创作助手。根据用户对话和已上传的图片理解需求。
只返回一个JSON对象：{"action":"reply或generate","reply":"中文答复","tasks":[{"name":"任务名","prompt":"完整中文生图提示词","ratio":"1:1等比例","image_indices":[0]}]}。
纯讨论/询问时action=reply；明确要求生成或修改图片时action=generate，tasks为1到8项。
没有图片也支持文生图。image_indices为当前图片的零基索引，按产品/风格参考的顺序选择，未选择则传全部图片。
保留用户提供的产品、配色、文字和数据，不编造疗效或数字。用户没有要求时不要添加雾化泛白、柔焦或文字光晕。
不要把仅分析/讨论的请求变成收费生图。prompt是完整可独立执行的提示词。'''


class ExtraPages:
    def __init__(self, core):
        self.c = core
        with core.db() as d:
            d.executescript('''
            CREATE TABLE IF NOT EXISTS extra_batches (id TEXT PRIMARY KEY,user_id TEXT,created REAL);
            CREATE TABLE IF NOT EXISTS extra_sessions (id TEXT PRIMARY KEY,user_id TEXT,title TEXT,created REAL,updated REAL,deleted INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS extra_messages (id TEXT PRIMARY KEY,session_id TEXT,role TEXT,text TEXT,status TEXT,images TEXT,settings TEXT,plan TEXT,created REAL,updated REAL,deleted INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS extra_links (task_id TEXT PRIMARY KEY,owner_id TEXT,variant INTEGER,task_name TEXT,prompt_index INTEGER);
            CREATE TABLE IF NOT EXISTS extra_requests (user_id TEXT,kind TEXT,request_id TEXT,owner_id TEXT,PRIMARY KEY(user_id,kind,request_id));
            ''')

    def settings(self, body, max_count):
        cfg = self.c.validate_config(body)
        ratio = str(body.get('ratio', '1:1'))
        if ratio not in RATIOS:
            raise HTTPException(400, '图片比例无效')
        try:
            count = int(body.get('count', 1))
        except (ValueError, TypeError):
            raise HTTPException(400, '图片数量无效')
        if not 1 <= count <= max_count:
            raise HTTPException(400, '图片数量超出范围')
        task_mode, ratio_mode = body.get('task_mode', 'confirm'), body.get('ratio_mode', 'smart')
        if task_mode not in {'confirm', 'auto'} or ratio_mode not in {'smart', 'manual', 'reference', 'product'}:
            raise HTTPException(400, '任务或比例模式无效')
        return cfg | {'ratio': ratio, 'count': count, 'task_mode': task_mode, 'ratio_mode': ratio_mode}

    def images(self, uid, values):
        if not isinstance(values, list) or len(values) > 20:
            raise HTTPException(400, '参考图数量无效')
        parsed, total = [], 0
        for value in values:
            if not isinstance(value, str) or not value.startswith('data:image/') or ';base64,' not in value:
                raise HTTPException(400, '请上传有效图片')
            try:
                raw = base64.b64decode(value.split(',', 1)[1], validate=True)
            except Exception:
                raise HTTPException(400, '参考图编码无效')
            total += len(raw)
            if total > 80 * 1024 * 1024:
                raise HTTPException(413, '参考图总量超过80MB')
            self.c.valid_image(raw)
            with Image.open(io.BytesIO(raw)) as im:
                ext = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp', 'BMP': '.bmp'}.get(im.format)
            if not ext:
                raise HTTPException(400, '不支持的图片格式')
            parsed.append((raw, ext))
        folder = self.c.DATA / 'users' / uid / 'extra' / 'inputs'
        paths = []
        for raw, ext in parsed:
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / (secrets.token_hex(16) + ext)
            target.write_bytes(raw)
            paths.append(target.relative_to(self.c.DATA).as_posix())
        return paths

    def request_id(self, body):
        rid = body.get('request_id') or secrets.token_hex(16)
        if not isinstance(rid, str) or not 8 <= len(rid) <= 128:
            raise HTTPException(400, '请求标识无效')
        return rid

    def geometry(self, cfg, paths, smart_ratio=None):
        mode = cfg['ratio_mode']
        if paths and mode in {'reference', 'product'}:
            reference = paths[-1] if mode == 'reference' else paths[0]
            return self.c.geometry_plan(self.c.image_geometry(self.c.DATA / reference), cfg['resolution'])
        ratio = smart_ratio if mode == 'smart' and smart_ratio in RATIOS else cfg['ratio']
        width, height = map(int, ratio.split(':'))
        return self.c.geometry_plan({'width': width, 'height': height}, cfg['resolution'])

    def queue(self, d, uid, owner, operation, prompt, cfg, paths, channel, variant=1, task_name='', prompt_index=1):
        tid, now = secrets.token_hex(16), time.time()
        cfg = cfg | {'input_paths': paths, 'owner_id': owner}
        d.execute('INSERT INTO tasks (id,user_id,project_id,ref,kind,operation,prompt,config,channel,state,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                  (tid, uid, 'extra:' + owner, '', 'chat' if operation == 'extra_plan' or cfg.get('chat') else 'single', operation, prompt, json.dumps(cfg, ensure_ascii=False), channel, self.c.EXTRA_WAITING, now, now))
        d.execute('INSERT INTO extra_links VALUES (?,?,?,?,?)', (tid, owner, variant, task_name, prompt_index))
        return tid

    def owned_session(self, d, uid, sid):
        row = d.execute('SELECT * FROM extra_sessions WHERE id=? AND user_id=? AND deleted=0', (sid, uid)).fetchone()
        if not row:
            raise HTTPException(404, '对话不存在')
        return dict(row)

    def create_session(self, d, uid):
        sid, now = secrets.token_hex(16), time.time()
        d.execute('INSERT INTO extra_sessions (id,user_id,title,created,updated) VALUES (?,?,?,?,?)', (sid, uid, '新对话', now, now))
        return sid

    def task_results(self, d, owner):
        return [dict(r) for r in d.execute('SELECT t.*,l.variant,l.task_name,l.prompt_index FROM tasks t JOIN extra_links l ON l.task_id=t.id WHERE l.owner_id=? ORDER BY l.prompt_index,l.variant,t.created', (owner,))]

    def result_rows(self, tasks):
        results, failures = [], []
        for t in tasks:
            if t['operation'] == 'extra_plan':
                continue
            if t['state'] == 'done' and t['result']:
                cfg = json.loads(t['config'])
                results.append({'index': t['variant'], 'variant_index': t['variant'], 'prompt_index': t['prompt_index'], 'task_name': t['task_name'], 'output_path': t['result'], 'output_url': self.c.image_url(t['result']), 'updated_at': t['updated'], 'ratio': cfg['geometry']['ratio'], 'template': '服务器自动分配'})
            elif t['state'] in {'failed', UNKNOWN}:
                failures.append({'index': t['variant'], 'variant_index': t['variant'], 'prompt_index': t['prompt_index'], 'error': t['error']})
        return results, failures

    def single_state(self, uid, bid):
        with self.c.db() as d:
            batch = d.execute('SELECT * FROM extra_batches WHERE id=? AND user_id=?', (bid, uid)).fetchone()
            if not batch:
                raise HTTPException(404, '单图任务不存在')
            tasks = self.task_results(d, bid)
        results, failures = self.result_rows(tasks)
        running = any(t['state'] in BUSY for t in tasks)
        status = 'running' if running else ('partial' if results and failures else ('done' if results else 'failed'))
        cfg = json.loads(tasks[0]['config']) if tasks else {}
        return {'ok': True, 'task_id': bid, 'status': status, 'count': len(tasks), 'size': cfg.get('geometry', {}).get('size', ''), 'used_images': len(cfg.get('input_paths', [])), 'results': results, 'failures': failures, 'error': failures[0]['error'] if failures else '', 'created_at': batch['created']}

    def chat_state(self, uid, sid=''):
        with self.c.db() as d:
            sessions = [dict(r) for r in d.execute('SELECT * FROM extra_sessions WHERE user_id=? AND deleted=0 ORDER BY updated DESC', (uid,))]
            if sid:
                self.owned_session(d, uid, sid)
            elif sessions:
                sid = sessions[0]['id']
            messages = []
            for m in d.execute('SELECT * FROM extra_messages WHERE session_id=? AND deleted=0 ORDER BY created,id', (sid,)):
                tasks = self.task_results(d, m['id'])
                results, failures = self.result_rows(tasks)
                status = m['status']
                if status in {'queued', 'generating'} and not any(t['state'] in BUSY for t in tasks):
                    status = 'partial' if results and failures else ('done' if results else 'failed')
                messages.append({'id': m['id'], 'role': m['role'], 'text': m['text'], 'status': status, 'images': [self.c.image_url(p) for p in json.loads(m['images'])] if m['role'] == 'user' else [], 'results': results, 'failures': failures, 'created_at': m['created'], 'updated_at': max([m['updated']] + [t['updated'] for t in tasks])})
            for s in sessions:
                s['created_at'], s['updated_at'] = s['created'], s['updated']
                s['active'] = s['id'] == sid
                s['running'] = d.execute("SELECT count(*) FROM extra_messages m WHERE m.session_id=? AND m.deleted=0 AND (m.status='plan_pending' OR EXISTS(SELECT 1 FROM extra_links l JOIN tasks t ON t.id=l.task_id WHERE l.owner_id=m.id AND t.state IN ('waiting_extra_v1','running','inferring','editing')))", (s['id'],)).fetchone()[0]
        return {'ok': True, 'session_id': sid, 'sessions': sessions, 'messages': messages}

    def generate_plan(self, d, uid, message, plan, paths, cfg, channel):
        for index, task in enumerate(plan['tasks'], 1):
            selected = [paths[i] for i in task['image_indices']] if task['image_indices'] else paths
            frozen = cfg | {'chat': True, 'geometry': self.geometry(cfg, selected, task['ratio'])}
            for variant in range(1, cfg['count'] + 1):
                self.queue(d, uid, message, 'extra_generate', task['prompt'], frozen, selected, channel, variant, task['name'], index)
        d.execute("UPDATE extra_messages SET status='queued',updated=? WHERE id=?", (time.time(), message))

    def parse_plan(self, text, paths, cfg):
        text = str(text).strip()
        if text.startswith('```'):
            text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text)
        try:
            body = json.loads(text)
        except (ValueError, TypeError):
            raise HTTPException(502, '任务理解返回格式无效；未提交生图')
        if not isinstance(body, dict) or body.get('action') not in {'reply', 'generate'}:
            raise HTTPException(502, '任务理解结果无效；未提交生图')
        reply = str(body.get('reply') or '').strip()[:12000]
        tasks = []
        if body['action'] == 'generate':
            values = body.get('tasks')
            if not isinstance(values, list) or not 1 <= len(values) <= 8:
                raise HTTPException(502, '生成计划任务数量无效')
            for item in values:
                if not isinstance(item, dict) or not isinstance(item.get('prompt'), str) or not item['prompt'].strip() or len(item['prompt']) > 12000:
                    raise HTTPException(502, '生成计划缺少有效提示词')
                indices = item.get('image_indices', [])
                if not isinstance(indices, list) or any(type(i) is not int or not 0 <= i < len(paths) for i in indices):
                    raise HTTPException(502, '生成计划图片选择无效')
                ratio = item.get('ratio', cfg['ratio'])
                if ratio not in RATIOS:
                    ratio = cfg['ratio']
                tasks.append({'name': str(item.get('name') or '图片')[:100], 'prompt': item['prompt'].strip(), 'ratio': ratio, 'image_indices': list(dict.fromkeys(indices))})
        return {'action': body['action'], 'reply': reply, 'tasks': tasks}

    async def execute(self, t):
        cfg = json.loads(t['config'])
        ch = json.loads(self.c.CIPHER.decrypt(t['channel'].encode()))
        try:
            if t['operation'] == 'extra_plan':
                with self.c.db() as d:
                    m = d.execute('SELECT * FROM extra_messages WHERE id=?', (cfg['owner_id'],)).fetchone()
                    session = d.execute('SELECT deleted FROM extra_sessions WHERE id=?', (m['session_id'],)).fetchone()
                    if m['deleted'] or session['deleted'] or m['status'] == 'cancelled':
                        d.execute("UPDATE tasks SET state='cancelled',updated=? WHERE id=?", (time.time(), t['id']))
                        return
                    history = [dict(r) for r in d.execute('SELECT role,text FROM extra_messages WHERE session_id=? AND deleted=0 AND created<? ORDER BY created DESC LIMIT 12', (m['session_id'], m['created']))][::-1]
                    if history and history[-1]['role'] == 'user':
                        history.pop()  # 当前消息将和图片一起发送，不重复注入。
                if not ch['text_model']:
                    raise HTTPException(400, '渠道尚未选择任务理解模型')
                content = [{'type': 'text', 'text': t['prompt'] + '\n当前设置：' + json.dumps({k: cfg[k] for k in ['ratio', 'ratio_mode', 'count']}, ensure_ascii=False)}]
                content += [{'type': 'image_url', 'image_url': {'url': self.c.data_url(self.c.DATA / p)}} for p in cfg['input_paths']]
                response = await self.c.upstream(ch, '/chat/completions', json={'model': ch['text_model'], 'messages': [{'role': 'system', 'content': PLAN_INSTRUCTION}] + [{'role': h['role'], 'content': h['text']} for h in history] + [{'role': 'user', 'content': content}], 'max_tokens': 3000}, timeout=cfg['timeout'])
                plan = self.parse_plan(response.json()['choices'][0]['message']['content'], cfg['input_paths'], cfg)
                lines = [plan['reply']] + [f"{i}. {x['name']} / {x['ratio']} / 每项{cfg['count']}张\n{x['prompt']}" for i, x in enumerate(plan['tasks'], 1)]
                with self.c.db() as d:
                    d.execute('BEGIN IMMEDIATE')
                    current = d.execute('SELECT * FROM extra_messages WHERE id=?', (cfg['owner_id'],)).fetchone()
                    session = d.execute('SELECT deleted FROM extra_sessions WHERE id=?', (current['session_id'],)).fetchone()
                    if current['deleted'] or session['deleted'] or current['status'] == 'cancelled':
                        d.execute("UPDATE tasks SET state='cancelled',updated=? WHERE id=?", (time.time(), t['id']))
                        return
                    status = 'plan_pending' if plan['action'] == 'generate' else 'done'
                    d.execute('UPDATE extra_messages SET text=?,status=?,plan=?,updated=? WHERE id=?', ('\n\n'.join(x for x in lines if x), status, json.dumps(plan, ensure_ascii=False), time.time(), cfg['owner_id']))
                    if plan['action'] == 'generate' and cfg['task_mode'] == 'auto':
                        self.generate_plan(d, t['user_id'], cfg['owner_id'], plan, cfg['input_paths'], cfg, t['channel'])
                    d.execute("UPDATE tasks SET state='done',updated=? WHERE id=?", (time.time(), t['id']))
                return
            geometry = cfg['geometry']
            if not ch['image_model']:
                raise HTTPException(400, '渠道尚未选择生图模型')
            prompt = t['prompt'] + f"\n画布比例{geometry['ratio']}，保持产品比例，文字清晰，不拉伸或强制方形。"
            params = {'model': ch['image_model'], 'prompt': prompt, 'n': 1, 'response_format': 'b64_json', 'size': geometry['size'], 'quality': cfg['quality']}
            if cfg['input_paths']:
                files = []
                for i, relative in enumerate(cfg['input_paths']):
                    p = self.c.owned_path(t['user_id'], relative)
                    raw = p.read_bytes()
                    with Image.open(io.BytesIO(raw)) as im:
                        mime = Image.MIME[im.format]
                    files.append(('image[]', (f'image-{i}' + p.suffix, raw, mime)))
                response = await self.c.upstream(ch, '/images/edits', data={k: str(v) for k, v in params.items()}, files=files, timeout=cfg['timeout'])
            else:
                response = await self.c.upstream(ch, '/images/generations', json=params, timeout=cfg['timeout'])
            rows = response.json().get('data', [])
            if not rows or not isinstance(rows[0], dict):
                raise HTTPException(502, '上游没有返回有效图片')
            value = rows[0]
            if value.get('b64_json'):
                raw = base64.b64decode(value['b64_json'], validate=True)
            elif value.get('url'):
                from urllib.parse import urlsplit
                url = value['url']
                if not isinstance(url, str) or urlsplit(url).scheme != 'https':
                    raise HTTPException(502, '上游图片下载地址无效')
                await self.c.checked_origin('https://' + urlsplit(url).netloc)
                raw = bytearray()
                async with self.c.CLIENT.stream('GET', url, follow_redirects=False, timeout=90) as downloaded:
                    downloaded.raise_for_status()
                    async for part in downloaded.aiter_bytes():
                        raw.extend(part)
                        if len(raw) > 20 * 1024 * 1024:
                            raise HTTPException(502, '上游图片超过20MB')
                raw = bytes(raw)
            else:
                raise HTTPException(502, '上游未返回图片内容')
            self.c.valid_image(raw)
            output = self.c.DATA / 'users' / t['user_id'] / 'extra' / 'results' / (t['id'] + '.png')
            output.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(io.BytesIO(raw)) as im:
                im.save(output.with_name('received-' + output.name), 'PNG')
                self.c.preserve_geometry(im, geometry).save(output, 'PNG')
            with self.c.db() as d:
                d.execute("UPDATE tasks SET state='done',result=?,updated=? WHERE id=?", (output.relative_to(self.c.DATA).as_posix(), time.time(), t['id']))
        except Exception as e:
            unknown = isinstance(e, (httpx.TimeoutException, httpx.NetworkError))
            error = '提交结果未知，请核对上游；未自动重发' if unknown else (str(e.detail) if isinstance(e, HTTPException) else '上游结果处理失败，请核对渠道与任务')
            with self.c.db() as d:
                d.execute('UPDATE tasks SET state=?,error=?,updated=? WHERE id=?', (UNKNOWN if unknown else 'failed', error, time.time(), t['id']))
                if t['operation'] == 'extra_plan':
                    d.execute("UPDATE extra_messages SET status='failed',text=?,updated=? WHERE id=? AND deleted=0 AND status!='cancelled'", (error, time.time(), cfg['owner_id']))

    def routes(self):
        core, web = self.c, self.c.app

        @web.get('/single')
        @web.get('/chat-image')
        async def page(request: Request):
            try:
                core.user(request)
            except HTTPException:
                return RedirectResponse('/login')
            return HTMLResponse((core.HERE / 'static' / (request.url.path.strip('/') + '.html')).read_text('utf-8'))

        @web.post('/api/settings')
        async def preferences(request: Request):
            u, body = core.user(request), await request.json()
            keys = {'single_quality', 'single_resolution', 'single_ratio', 'single_count', 'chat_task_mode', 'chat_ratio_mode'}
            allowed = {k: v for k, v in body.items() if k in keys}
            checked = self.settings({'quality': allowed.get('single_quality', 'high'), 'resolution': allowed.get('single_resolution', '2k'), 'ratio': allowed.get('single_ratio', '1:1'), 'count': allowed.get('single_count', 1), 'task_mode': allowed.get('chat_task_mode', 'confirm'), 'ratio_mode': allowed.get('chat_ratio_mode', 'smart')}, 20)
            with core.db() as d:
                previous = d.execute('SELECT value FROM settings WHERE key=?', ('preferences:' + u['id'],)).fetchone()
                value = (json.loads(previous['value']) if previous else {}) | allowed
                d.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('preferences:' + u['id'], json.dumps(value)))
            return {'ok': True}

        @web.post('/api/single/start')
        async def single_start(request: Request):
            u, body = core.user(request), await request.json()
            cfg = self.settings(body, 20) | {'ratio_mode': 'manual'}
            prompt = str(body.get('prompt', '')).strip()
            if not prompt or len(prompt) > 12000:
                raise HTTPException(400, '请填写有效提示词')
            rid = self.request_id(body)
            with core.db() as d:
                previous = d.execute("SELECT owner_id FROM extra_requests WHERE user_id=? AND kind='single' AND request_id=?", (u['id'], rid)).fetchone()
            if previous:
                return self.single_state(u['id'], previous['owner_id'])
            paths, bid = self.images(u['id'], body.get('images', [])), secrets.token_hex(16)
            cfg['geometry'] = self.geometry(cfg, paths)
            channel = core.freeze_channel(core.channel_record())
            with core.db() as d:
                d.execute('BEGIN IMMEDIATE')
                previous = d.execute("SELECT owner_id FROM extra_requests WHERE user_id=? AND kind='single' AND request_id=?", (u['id'], rid)).fetchone()
                if not previous:
                    d.execute('INSERT INTO extra_batches VALUES (?,?,?)', (bid, u['id'], time.time()))
                    d.execute('INSERT INTO extra_requests VALUES (?,?,?,?)', (u['id'], 'single', rid, bid))
                    for i in range(1, cfg['count'] + 1):
                        self.queue(d, u['id'], bid, 'extra_generate', prompt, cfg, paths, channel, i)
                else:
                    bid = previous['owner_id']
            return self.single_state(u['id'], bid)

        @web.get('/api/single/status')
        async def single_status(request: Request, id: str):
            return self.single_state(core.user(request)['id'], id)

        @web.get('/api/single/tasks')
        async def single_tasks(request: Request):
            u = core.user(request)
            with core.db() as d:
                ids = [r['id'] for r in d.execute('SELECT id FROM extra_batches WHERE user_id=? ORDER BY created DESC LIMIT 50', (u['id'],))]
            return {'ok': True, 'tasks': [self.single_state(u['id'], bid) for bid in ids]}

        @web.get('/api/chat-image/state')
        async def chat_state(request: Request, session_id: str = ''):
            return self.chat_state(core.user(request)['id'], session_id)

        @web.post('/api/chat-image/new')
        async def new_chat(request: Request):
            u = core.user(request)
            with core.db() as d:
                sid = self.create_session(d, u['id'])
            return self.chat_state(u['id'], sid)

        @web.post('/api/chat-image/send')
        async def send_chat(request: Request):
            u, body = core.user(request), await request.json()
            cfg = self.settings(body.get('settings', {}), 8) | {'chat': True}
            text = str(body.get('message', '')).strip()
            if len(text) > 12000 or (not text and not body.get('images')):
                raise HTTPException(400, '请填写消息或选择参考图')
            rid, sid = self.request_id(body), str(body.get('session_id') or '')
            with core.db() as d:
                if sid:
                    self.owned_session(d, u['id'], sid)
                previous = d.execute("SELECT owner_id FROM extra_requests WHERE user_id=? AND kind='chat' AND request_id=?", (u['id'], rid)).fetchone()
                if previous:
                    return self.chat_state(u['id'], previous['owner_id'])
                if sid:
                    pending = d.execute("SELECT 1 FROM extra_messages WHERE session_id=? AND deleted=0 AND status IN ('thinking','plan_pending')", (sid,)).fetchone()
                    if pending:
                        raise HTTPException(409, '请先确认或取消当前计划')
            paths = self.images(u['id'], body.get('images', []))
            channel = core.freeze_channel(core.channel_record())
            with core.db() as d:
                d.execute('BEGIN IMMEDIATE')
                previous = d.execute("SELECT owner_id FROM extra_requests WHERE user_id=? AND kind='chat' AND request_id=?", (u['id'], rid)).fetchone()
                if previous:
                    sid = previous['owner_id']
                else:
                    if sid:
                        self.owned_session(d, u['id'], sid)
                        if d.execute("SELECT 1 FROM extra_messages WHERE session_id=? AND deleted=0 AND status IN ('thinking','plan_pending')", (sid,)).fetchone():
                            raise HTTPException(409, '请先确认或取消当前计划')
                    else:
                        sid = self.create_session(d, u['id'])
                    # 无新图片时延续最近一次图片上下文，保持聊天修改连贯。
                    if not paths:
                        last_result = d.execute("SELECT t.result FROM extra_messages m JOIN extra_links l ON l.owner_id=m.id JOIN tasks t ON t.id=l.task_id WHERE m.session_id=? AND m.deleted=0 AND t.state='done' AND t.operation='extra_generate' ORDER BY t.updated DESC LIMIT 1", (sid,)).fetchone()
                        last_input = d.execute("SELECT images FROM extra_messages WHERE session_id=? AND role='user' AND deleted=0 AND images!='[]' ORDER BY created DESC LIMIT 1", (sid,)).fetchone()
                        paths = [last_result['result']] if last_result else (json.loads(last_input['images']) if last_input else [])
                    now, user_mid, assistant_mid = time.time(), secrets.token_hex(16), secrets.token_hex(16)
                    for mid, role, content, status in [(user_mid, 'user', text or '请根据参考图片生成', 'done'), (assistant_mid, 'assistant', '正在理解需求…', 'thinking')]:
                        d.execute('INSERT INTO extra_messages (id,session_id,role,text,status,images,settings,plan,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?)', (mid, sid, role, content, status, json.dumps(paths), json.dumps(cfg), '{}', now + (0 if role == 'user' else .0001), now))
                    d.execute('UPDATE extra_sessions SET title=CASE WHEN title=\'新对话\' THEN ? ELSE title END,updated=? WHERE id=?', ((text or '图片创作')[:60], now, sid))
                    d.execute('INSERT INTO extra_requests VALUES (?,?,?,?)', (u['id'], 'chat', rid, sid))
                    self.queue(d, u['id'], assistant_mid, 'extra_plan', text or '根据图片生成', cfg, paths, channel)
            return self.chat_state(u['id'], sid)

        @web.post('/api/chat-image/confirm')
        async def confirm(request: Request):
            u, body = core.user(request), await request.json()
            sid, mid = str(body.get('session_id', '')), str(body.get('message_id', ''))
            with core.db() as d:
                d.execute('BEGIN IMMEDIATE')
                self.owned_session(d, u['id'], sid)
                m = d.execute('SELECT * FROM extra_messages WHERE id=? AND session_id=? AND deleted=0', (mid, sid)).fetchone()
                if not m:
                    raise HTTPException(404, '计划不存在')
                if m['status'] == 'plan_pending':
                    plan_task = d.execute('SELECT t.* FROM tasks t JOIN extra_links l ON l.task_id=t.id WHERE l.owner_id=? AND operation=\'extra_plan\'', (mid,)).fetchone()
                    # 确认使用原计划冻结的输入、渠道和设置，不能被随后管理员更新悄悄改变。
                    cfg = json.loads(m['settings'])
                    if body.get('settings'):
                        cfg = cfg | self.settings(body['settings'], 8) | {'chat': True}
                    self.generate_plan(d, u['id'], mid, json.loads(m['plan']), json.loads(m['images']), cfg, plan_task['channel'])
                elif m['status'] not in {'queued', 'generating', 'done', 'partial', 'failed'}:
                    raise HTTPException(409, '当前计划不能确认')
            return self.chat_state(u['id'], sid)

        @web.post('/api/chat-image/cancel')
        @web.post('/api/chat-image/clear')
        @web.post('/api/chat-image/delete')
        async def remove(request: Request):
            u, body = core.user(request), await request.json()
            sid, action = str(body.get('session_id', '')), request.url.path.rsplit('/', 1)[1]
            with core.db() as d:
                d.execute('BEGIN IMMEDIATE')
                self.owned_session(d, u['id'], sid)
                if action == 'cancel':
                    m = d.execute('SELECT id,status FROM extra_messages WHERE id=? AND session_id=? AND deleted=0', (str(body.get('message_id', '')), sid)).fetchone()
                    if not m:
                        raise HTTPException(404, '计划不存在')
                    if m['status'] not in {'thinking', 'plan_pending', 'cancelled'}:
                        raise HTTPException(409, '任务已提交，不能作为未生成计划取消')
                    d.execute("UPDATE extra_messages SET status='cancelled',updated=? WHERE id=?", (time.time(), m['id']))
                    owners = [m['id']]
                else:
                    owners = [r['id'] for r in d.execute('SELECT id FROM extra_messages WHERE session_id=?', (sid,))]
                    d.execute('UPDATE extra_messages SET deleted=1,updated=? WHERE session_id=?', (time.time(), sid))
                    if action == 'delete':
                        d.execute('UPDATE extra_sessions SET deleted=1 WHERE id=?', (sid,))
                for owner in owners:
                    d.execute("UPDATE tasks SET state='cancelled',updated=? WHERE id IN (SELECT task_id FROM extra_links WHERE owner_id=?) AND state=?", (time.time(), owner, core.EXTRA_WAITING))
                # 在途供应商请求不取消/重发；结果仍持久保存，历史仅软隐藏。
            return self.chat_state(u['id'], '' if action == 'delete' else sid)


def register(core):
    instance = ExtraPages(core)
    instance.routes()
    return instance
