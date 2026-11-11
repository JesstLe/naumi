"""Create a clean, offline-viewable package containing ONLY admitted assets."""
import html
import json
import pathlib
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageOps
from collect_public_cases import ROOT, DATA, OUT, PACKAGE, SHEETS, read, dump, file_sha

DELIVERY = OUT / "delivery"


def build():
    cases = read(DATA / "verified-cases.json")
    catalog = read(DATA / "catalog.json")
    allowed = set()
    for c in cases:
        for field in ["poster", "video"]:
            if field not in c:
                continue
            rel = "public/" + c[field].lstrip("/")
            source = PACKAGE / rel
            target = DELIVERY / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            allowed.add(rel)
            if field == "video":
                c["videoSha256"] = file_sha(source)
                c["videoBytes"] = source.stat().st_size
            else:
                c["posterBytes"] = source.stat().st_size
    dump(DATA / "verified-cases.json", cases)
    dump(DELIVERY / "catalog.json", catalog)
    dump(DELIVERY / "ATTRIBUTION.json", {"description": "Published source works, not Naumi generated results. Per-asset attribution and original prompts are distinct from editorial adaptations.", "items": cases})
    for source in (DATA / "source-evidence").rglob("*"):
        if source.is_file():
            dest = DELIVERY / source.relative_to(DATA)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    # Immutable review receipts and machine-readable indexes accompany the media.
    for name in ["summary.json", "cases.csv", "candidate-status.json", "dedup-report.json", "perceptual-dedup-review.json", "media-verification.json", "link-audit.json", "source-inventory.json", "visual-review.json", "gallery-verification.json", "narrative-candidates.json", "README.md", "VERIFICATION.txt"]:
        if (DATA / name).exists():
            shutil.copyfile(DATA / name, DELIVERY / name)
    gallery(catalog)
    make_overview(cases)
    manifest = []
    for p in sorted(DELIVERY.rglob("*")):
        if p.is_file() and p.name != "MANIFEST.json":
            manifest.append({"path": str(p.relative_to(DELIVERY)).replace("\\", "/"), "bytes": p.stat().st_size, "sha256": file_sha(p)})
    dump(DELIVERY / "MANIFEST.json", manifest)
    # Reopen and byte-check every delivered artifact; rejects stale/unadmitted media.
    actual_media = {str(p.relative_to(DELIVERY)).replace("\\", "/") for p in (DELIVERY / "public").rglob("*") if p.is_file()}
    assert actual_media == allowed
    for record in read(DELIVERY / "MANIFEST.json"):
        p = DELIVERY / record["path"]
        assert file_sha(p) == record["sha256"]
        if p.suffix.lower() in [".webp", ".jpg", ".png"]:
            with Image.open(p) as im:
                im.load()
        elif p.suffix == ".json":
            read(p)
        elif p.suffix in [".md", ".html", ".txt", ".csv", ".yml"]:
            p.read_text(encoding="utf-8-sig")
    archive = OUT / "naumi-public-cases-20261111.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        for p in sorted(DELIVERY.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(DELIVERY))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
    result = {"result": "PACKAGE_PASS", "catalogCases": len(cases), "mediaFiles": len(allowed), "manifestFiles": len(manifest), "mediaBytes": sum((DELIVERY / p).stat().st_size for p in allowed), "zipBytes": archive.stat().st_size, "zipSha256": file_sha(archive), "zipPath": str(archive), "packagePath": str(DELIVERY)}
    dump(DATA / "package-verification.json", result)
    print(json.dumps(result))


def gallery(catalog):
    cards = []
    for c in sorted(catalog, key=lambda c: (0 if c["id"].startswith("pc-story-") else 1, c["category"], c["id"])):
        esc = html.escape
        poster = "public" + c["poster"]
        media = f'<img src="{esc(poster)}" loading="lazy" alt="{esc(c["title"])}">'
        if c["kind"] == "video":
            media = f'<video controls preload="none" poster="{esc(poster)}" src="public{esc(c["video"])}"></video>'
        cards.append(f'<article data-kind="{c["kind"]}" data-search="{esc(c["title"]+c["category"]+" ".join(c["tags"]))}">{media}<div class="body"><h2>{esc(c["title"])}</h2><p class="meta">{esc(c["category"])} · {esc(c["source"]["license"])}</p><details><summary>创作方法与来源</summary><p>{esc(c["prompt"])}</p><ol>'+"".join('<li>'+esc(s)+'</li>' for s in c['steps'])+f'</ol><a href="{esc(c["source"]["url"])}">{esc(c["source"]["author"])}</a><p>{esc(c["adaptation"])}</p><code>{c["id"]}</code></details></div></article>')
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Naumi 公开案例内容包</title><style>
body{margin:0;background:#f6f7f9;color:#161a22;font:15px/1.55 system-ui,"Microsoft YaHei",sans-serif}header{position:sticky;top:0;z-index:2;background:#ffffffed;backdrop-filter:blur(16px);border-bottom:1px solid #e6e8ee;padding:16px 24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}h1{font-size:20px;margin:0 18px 0 0}input,select{padding:10px 12px;border:1px solid #dce0e8;border-radius:10px;background:#fff;font:inherit}input{min-width:240px}main{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:20px;align-items:start}article{background:#fff;border:1px solid #e6e8ee;border-radius:16px;overflow:hidden;box-shadow:0 5px 16px #18284b06}img,video{width:100%;height:235px;object-fit:contain;background:#f0f1f3;display:block}.body{padding:15px}h2{font-size:17px;margin:0 0 7px}.meta{color:#687284;font-size:12px;margin:0 0 10px}details p,li{font-size:13px}summary{cursor:pointer;font-size:13px;color:#2c5cce}a{color:#2c5cce}code{font-size:11px;color:#687284}article[hidden]{display:none}
</style><header><h1>公开创作案例</h1><input id="q" placeholder="搜索案例"><select id="kind"><option value="">全部</option><option value="image">图片</option><option value="video">视频</option></select><select id="story"><option value="">全部形式</option><option value="story">完整叙事 / 漫剧</option></select><span id="count"></span></header><main>'''+"".join(cards)+'''</main><script>
const q=document.querySelector('#q'),kind=document.querySelector('#kind'),story=document.querySelector('#story');function filter(){let n=0;for(const c of document.querySelectorAll('article')){const ok=(!kind.value||c.dataset.kind===kind.value)&&(!story.value||c.textContent.includes('pc-story-'))&&q.value.toLowerCase().split(/\\s+/).every(s=>c.dataset.search.toLowerCase().includes(s));c.hidden=!ok;if(ok)n++}document.querySelector('#count').textContent=n+' 个'}q.oninput=kind.onchange=story.onchange=filter;filter();</script></html>'''
    (DELIVERY / "index.html").write_text(page, encoding="utf8")


def make_overview(cases):
    ids = ["pc-gpt4o-007", "pc-gpt4o-035", "pc-gpt4o-063", "pc-gpt4o-078", "pc-gpt4o-073", "pc-gpt4o-093", "pc-gpt4o-051", "pc-gpt4o-077"]
    selected = [next(c for c in cases if c["id"] == identifier) for identifier in ids]
    selected += [c for c in cases if c.get("narrative")]
    w, cw, ch = 1440, 360, 277
    canvas = Image.new("RGB", (w, 90 + ((len(selected)+3)//4)*ch), "#f5f6f8")
    d = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 21)
    head = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 30)
    small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 14)
    d.text((18, 12), "Naumi 公开案例 · 内容抽样", fill="#182236", font=head)
    d.text((18, 54), "259 张图片 · 125 部/段视频 · 含 3 集动态漫与 3 部叙事短片", fill="#58647a", font=font)
    for i, c in enumerate(selected):
        x,y=(i%4)*cw,90+(i//4)*ch
        # Narrative poster uses an actual story frame, not an end-credit frame.
        path = PACKAGE / "public" / c["poster"].lstrip("/")
        if c.get("narrative"):
            sample = 4 if c["id"] == "pc-story-sintel" else 3
            path = OUT / "story-credits" / (c["id"] + f"-sample-{sample}.jpg")
        with Image.open(path) as im:
            im=ImageOps.contain(im.convert("RGB"),(346,216));canvas.paste(im,(x+(cw-im.width)//2,y))
        d.text((x+9,y+220),c["title"],fill="#202b3f",font=small)
        d.text((x+9,y+242),c["id"],fill="#758098",font=small)
    canvas.save(OUT / "collection-overview.png")
    shutil.copyfile(OUT / "collection-overview.png", DELIVERY / "collection-overview.png")


if __name__ == "__main__":
    build()
