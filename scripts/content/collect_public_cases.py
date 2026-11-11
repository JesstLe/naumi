"""Revision-pinned public media collection. No generation APIs or application imports.

python scripts/content/collect_public_cases.py discover
python scripts/content/collect_public_cases.py media --video-limit 150
python scripts/content/collect_public_cases.py sheets
python scripts/content/collect_public_cases.py export
python scripts/content/collect_public_cases.py verify

Raw archives/MP4s stay under ignored output/. Decisions and metadata are versioned.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import csv
import hashlib
import io
import json
import math
import pathlib
import re
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

import imagehash
import pyarrow.parquet as pq
import yaml
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "content/public-cases-collection"
OUT = ROOT / "output/public-case-collection"
RESEARCH = OUT / "research"
ORIGINALS = OUT / "originals"
PACKAGE = OUT / "package"
MEDIA = PACKAGE / "public/creation-cases/collection-20261111"
SHEETS = OUT / "contact-sheets"
NOW = lambda: datetime.now(timezone.utc).isoformat()
GITHUB_SHA = "3ed4dbb0f1ae6f7385c81e1fcea48d9eefd2e596"
IMAGE_REPO = "Rapidata/700k_Human_Preference_Dataset_FLUX_SD3_MJ_DALLE3"
IMAGE_SHA = "5045367fb66da08dfdb1cbd225d74e35e57899b4"
VIDEO_REPO = "Rapidata/text-2-video-Rich-Human-Feedback"
VIDEO_SHA = "36c4a5925f6f3f3cbebf0d84e8238ed816873d1b"
DIFF_SHA = "fb620fbe49fa4420e0734bd9c0df11f51176b61f"
NET_LOCK = threading.Lock()
LAST_REQUEST = 0.0


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def read(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url, path, max_bytes=1100 * 1024 * 1024):
    """Bounded retries, global pacing, atomic files, durable request receipts."""
    global LAST_REQUEST
    if path.exists():
        return path
    for attempt in range(3):
        try:
            with NET_LOCK:
                time.sleep(max(0, .25 - (time.monotonic() - LAST_REQUEST)))
                LAST_REQUEST = time.monotonic()
            req = urllib.request.Request(url, headers={"User-Agent": "Naumi-Public-Case-Research/1.0"})
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".partial")
            with urllib.request.urlopen(req, timeout=90) as response, tmp.open("wb") as f:
                count = 0
                while block := response.read(1024 * 1024):
                    count += len(block)
                    if count > max_bytes:
                        raise ValueError("asset exceeds byte budget")
                    f.write(block)
                receipt = {"url": url, "status": response.status, "bytes": count, "retrievedAt": NOW()}
            tmp.replace(path)
            with NET_LOCK, (OUT / "requests.jsonl").open("a", encoding="utf-8") as log:
                log.write(json.dumps(receipt) + "\n")
            return path
        except Exception as error:
            with NET_LOCK, (OUT / "requests.jsonl").open("a", encoding="utf-8") as log:
                log.write(json.dumps({"url": url, "error": repr(error), "attempt": attempt, "at": NOW()}) + "\n")
            if attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))


def run(command):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"exit={result.returncode}: {command}\n{result.stderr[-3000:]}")
    return result.stdout


def base(identifier, kind, source, prompt, url, page, license_name, basis):
    return {"id": identifier, "kind": kind, "sourceKey": source, "originalPrompt": prompt,
            "originalAssetUrl": url, "sourcePage": page, "license": license_name,
            "licenseBasisUrl": basis, "retrievedAt": NOW(), "status": "candidate",
            "promptProvenance": "verbatim-source", "naumiGenerationVerified": False}


def discover():
    for p in [DATA, RESEARCH, ORIGINALS, MEDIA, SHEETS]:
        p.mkdir(parents=True, exist_ok=True)
    candidates = []
    archive = fetch(f"https://codeload.github.com/jamez-bondos/awesome-gpt4o-images/zip/{GITHUB_SHA}", RESEARCH / "gpt4o-fixed.zip")
    exclusions = read(DATA / "exclusions.json", {})
    excluded_urls = set(exclusions.get("parentOriginalUrls", []))
    z = zipfile.ZipFile(archive)
    prefix = z.namelist()[0]
    evidence = DATA / "source-evidence/gpt4o"
    for i in range(1, 101):
        folder = f"cases/{i}"
        case_bytes = z.read(prefix + folder + "/case.yml")
        attr_bytes = z.read(prefix + folder + "/ATTRIBUTION.yml")
        case, attr = yaml.safe_load(case_bytes), yaml.safe_load(attr_bytes)
        for name, raw in [("case.yml", case_bytes), ("ATTRIBUTION.yml", attr_bytes)]:
            dest = evidence / str(i) / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(raw)
        image = case["image"]
        rawpath = f"{folder}/{image}"
        url = f"https://raw.githubusercontent.com/jamez-bondos/awesome-gpt4o-images/{GITHUB_SHA}/{urllib.parse.quote(rawpath)}"
        page = f"https://github.com/jamez-bondos/awesome-gpt4o-images/tree/{GITHUB_SHA}/{folder}"
        basis = f"https://github.com/jamez-bondos/awesome-gpt4o-images/blob/{GITHUB_SHA}/{folder}/ATTRIBUTION.yml"
        c = base(f"pc-gpt4o-{i:03d}", "image", "gpt4o", case.get("prompt", ""), url, page, attr.get("license"), basis)
        c.update(title=case["title"], author=attr.get("image_author"), promptAuthor=attr.get("prompt_author"),
                 sourceRevision=GITHUB_SHA, attribution=attr, sourceMetadata=case,
                 licenseStatus="verified-per-asset-declaration", licenseEvidenceFile=f"source-evidence/gpt4o/{i}/ATTRIBUTION.yml")
        if attr.get("title") != case.get("title") or attr.get("prompt_author") != case.get("author"):
            c.update(status="pending-provenance", reason="case.yml / ATTRIBUTION.yml identity mismatch")
        if url in excluded_urls:
            c.update(status="excluded-existing", reason="parent first batch original asset")
        dest = ORIGINALS / (c["id"] + pathlib.Path(image).suffix)
        dest.write_bytes(z.read(prefix + rawpath))
        c["originalLocalPath"] = str(dest.relative_to(ROOT)).replace("\\", "/")
        candidates.append(c)
    # One winning original per normalized prompt; never count pair rows as cases.
    best = {}
    for n in range(1, 7):
        name = f"data/train_{n:04d}-00000-of-00001.parquet"
        url = f"https://huggingface.co/datasets/{IMAGE_REPO}/resolve/{IMAGE_SHA}/{name}"
        path = fetch(url, RESEARCH / f"rap-images-{n:04d}.parquet")
        for row_index, row in enumerate(pq.read_table(path).to_pylist()):
            norm = " ".join(row["prompt"].lower().split())
            for side in [1, 2]:
                votes = row[f"votes_image{side}"]
                other = row[f"votes_image{3-side}"]
                score = (votes + 2) / (votes + other + 4)
                # Deterministic choice, including tie break by original image identity.
                key = (score, votes, row[f"image{side}_path"])
                if norm not in best or key > best[norm]["rank"]:
                    best[norm] = dict(rank=key, row=row, side=side, row_index=row_index, shard=n, url=url)
    for norm, item in sorted(best.items()):
        r, side = item["row"], item["side"]
        identifier = "pc-rapimg-" + sha(norm.encode())[:12]
        page = f"https://huggingface.co/datasets/{IMAGE_REPO}/blob/{IMAGE_SHA}/README.md"
        c = base(identifier, "image", "rapidata-images", r["prompt"], item["url"], page, "CDLA-Permissive-2.0", page)
        c.update(author="Rapidata（数据发布者；单图创作者未署名）", sourceRevision=IMAGE_SHA,
                 assetLocator={"format": "parquet", "row": item["row_index"], "column": f"image{side}", "shard": item["shard"], "sourceImagePath": r[f"image{side}_path"]},
                 sourceModel=r[f"model{side}"], preferenceScore=item["rank"][0],
                 licenseStatus="verified-dataset-media-declaration", licenseEvidenceFile="source-evidence/rapidata-images-README.md")
        dest = ORIGINALS / (identifier + ".jpg")
        dest.write_bytes(r[f"image{side}"]["bytes"])
        c["originalLocalPath"] = str(dest.relative_to(ROOT)).replace("\\", "/")
        candidates.append(c)
    name = "data/train-00000-of-00001.parquet"
    url = f"https://huggingface.co/datasets/{VIDEO_REPO}/resolve/{VIDEO_SHA}/{name}"
    path = fetch(url, RESEARCH / (VIDEO_REPO.replace("/", "--") + ".parquet"))
    for r in pq.read_table(path).to_pylist():
        filename = r["filename"]
        page = f"https://huggingface.co/datasets/{VIDEO_REPO}/blob/{VIDEO_SHA}/README.md"
        asset = f"https://huggingface.co/datasets/{VIDEO_REPO}/resolve/{VIDEO_SHA}/Videos/{filename}"
        c = base("pc-rapvid-" + filename.split("_")[0], "video", "rapidata-videos", r["prompt"], asset, page, "Apache-2.0", page)
        c.update(author="Rapidata（数据发布者；单片创作者未署名）", sourceRevision=VIDEO_SHA, sourceModel="Sora (source dataset)",
                 sourceScores={k: v for k, v in r.items() if k.startswith("likert_score_")}, sourceCategory=r["category"],
                 licenseStatus="verified-dataset-media-declaration", licenseEvidenceFile="source-evidence/rapidata-videos-README.md")
        candidates.append(c)
    # Optional independent CC0 image expansion; one seed per exact prompt.
    diffzip = fetch(f"https://huggingface.co/datasets/poloclub/diffusiondb/resolve/{DIFF_SHA}/images/part-000001.zip", RESEARCH / "diffusiondb-part-000001.zip")
    if diffzip.exists():
        dz = zipfile.ZipFile(diffzip)
        meta_name = next(x for x in dz.namelist() if x.endswith(".json"))
        meta = json.loads(dz.read(meta_name))
        seen = set()
        for filename, r in meta.items():
            norm = " ".join(r["p"].lower().split())
            if norm in seen:
                continue
            seen.add(norm)
            identifier = "pc-diffdb-" + filename.split(".")[0][:12]
            page = f"https://huggingface.co/datasets/poloclub/diffusiondb/blob/{DIFF_SHA}/README.md"
            url = f"https://huggingface.co/datasets/poloclub/diffusiondb/resolve/{DIFF_SHA}/images/part-000001.zip"
            c = base(identifier, "image", "diffusiondb", r["p"], url, page, "CC0-1.0", page + "#licensing-information")
            c.update(author="DiffusionDB / Polo Club（匿名用户作品；发布者署名）", sourceRevision=DIFF_SHA,
                     assetLocator={"format": "zip", "member": filename}, sourceMetadata=r,
                     licenseStatus="verified-dataset-media-declaration", licenseEvidenceFile="source-evidence/diffusiondb-README.md")
            dest = ORIGINALS / (identifier + pathlib.Path(filename).suffix)
            dest.write_bytes(dz.read(filename))
            c["originalLocalPath"] = str(dest.relative_to(ROOT)).replace("\\", "/")
            candidates.append(c)
    candidates.extend(read(DATA / "narrative-candidates.json", []))
    dump(DATA / "candidates.json", candidates)
    print(json.dumps({"candidates": len(candidates), "sources": dict(collections.Counter(c["sourceKey"] for c in candidates))}))


def process_one(c):
    if c["status"].startswith(("excluded", "pending-provenance")):
        return c
    try:
        if c["kind"] == "video":
            if c.get("originalLocalPath") and (ROOT / c["originalLocalPath"]).exists():
                path = ROOT / c["originalLocalPath"]
            elif (c.get("assetLocator") or {}).get("format") == "zip":
                archive = fetch(c["originalAssetUrl"], RESEARCH / (c["id"] + ".zip"))
                path = ORIGINALS / (c["id"] + ".mp4")
                path.write_bytes(zipfile.ZipFile(archive).read(c["assetLocator"]["member"]))
            else:
                path = fetch(c["originalAssetUrl"], ORIGINALS / (c["id"] + ".mp4"), (600 if c.get("narrative") else 40) * 1024 * 1024)
            c["originalLocalPath"] = str(path.relative_to(ROOT)).replace("\\", "/")
        else:
            path = ROOT / c["originalLocalPath"]
        c["originalSha256"] = file_sha(path)
        c["originalBytes"] = path.stat().st_size
        poster = MEDIA / (c["id"] + ".webp")
        if c["kind"] == "image":
            with Image.open(path) as original:
                original.load()
                image = ImageOps.exif_transpose(original).convert("RGB")
            c["originalWidth"], c["originalHeight"] = image.size
            c["pixelSha256"] = sha(image.tobytes() + str(image.size).encode())
            c["perceptualHash"] = str(imagehash.phash(image))
            image.thumbnail((1280, 1440))
            image.save(poster, "WEBP", quality=86, method=5)
            c["width"], c["height"] = image.size
            c["mediaVerification"] = {"imageDecode": "PASS", "posterDecode": "PASS"}
            c["transform"] = "EXIF transpose; RGB; fit within 1280x1440 without crop; WebP q86. No new imagery."
        else:
            info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]))
            stream = next(s for s in info["streams"] if s["codec_type"] == "video")
            c["originalWidth"], c["originalHeight"] = stream["width"], stream["height"]
            c["duration"] = float(info["format"]["duration"])
            run(["ffmpeg", "-v", "error", "-xerror", "-threads", "2", "-i", path, "-map", "0:v:0", "-f", "null", "-"])
            video = MEDIA / (c["id"] + ".mp4")
            if not video.exists():
                audio = ["-map", "0:a?", "-c:a", "aac", "-b:a", "96k"] if c.get("narrative") else ["-an"]
                width = 720 if c.get("narrative") else 960
                run(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-i", path, "-map", "0:v:0", *audio, "-vf", f"scale='min({width},iw)':-2", "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video])
            run(["ffmpeg", "-v", "error", "-xerror", "-threads", "2", "-i", video, "-f", "null", "-"])
            c["video"] = "/creation-cases/collection-20261111/" + video.name
            frames = []
            for index, fraction in enumerate([.1, .5, .9]):
                frame = OUT / "frames" / (c["id"] + f"-{index}.jpg")
                frame.parent.mkdir(parents=True, exist_ok=True)
                run(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-ss", str(c["duration"] * fraction), "-i", video, "-frames:v", "1", "-q:v", "3", frame])
                with Image.open(frame) as image:
                    image.load()
                    frames.append(str(imagehash.phash(image)))
                    if index == 1:
                        c["width"], c["height"] = image.size
                        image.save(poster, "WEBP", quality=86)
            c["frameHashes"] = frames
            c["mediaVerification"] = {"ffprobe": "PASS", "fullOriginalVideoDecode": "PASS", "fullBrowsingVideoDecode": "PASS", "sampledFrames": 3}
            c["transform"] = "Full independent original clip; no temporal/spatial crop; H264 yuv420p CRF23 faststart max width960; audio removed; poster from midpoint."
            if c.get("narrative"):
                c["transform"] = "Full narrative work including credits, no temporal/spatial crop; H264 yuv420p CRF23 faststart max width720; original audio retained as AAC96k; poster from midpoint."
        with Image.open(poster) as image:
            image.load()
        c["poster"] = "/creation-cases/collection-20261111/" + poster.name
        c["posterSha256"] = file_sha(poster)
        c["mediaStatus"] = "verified"
        c["status"] = "awaiting-editorial-review"
    except Exception as error:
        c.update(status="media-failed", failure=repr(error))
    return c


def media(limit):
    candidates = read(DATA / "candidates.json")
    old = {c["id"]: c for c in read(OUT / "processed.json", [])}
    # Source card's style-score direction is internally inconsistent: do not auto-accept.
    videos = sorted([c for c in candidates if c["kind"] == "video" and not c.get("narrative")], key=lambda c: (-c["sourceScores"]["likert_score_style"], c["id"]))[:limit]
    video_ids = {c["id"] for c in videos}
    todo = [c for c in candidates if c["kind"] == "image" or c["id"] in video_ids or c.get("narrative")]
    done = []
    def worker(c):
        previous = old.get(c["id"])
        if previous and previous.get("mediaStatus") == "verified" and (MEDIA / (c["id"] + ".webp")).exists():
            return previous
        return process_one(c)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for index, c in enumerate(executor.map(worker, todo)):
            done.append(c)
            if index % 15 == 0:
                dump(OUT / "processed.json", done + [v for k, v in old.items() if k not in {x["id"] for x in done}])
                print("processed", index + 1, "/", len(todo), c["id"], c["status"], flush=True)
    untouched = [c for c in candidates if c["id"] not in {x["id"] for x in done}]
    dump(OUT / "processed.json", done + untouched)
    print("MEDIA", dict(collections.Counter(c["status"] for c in done + untouched)))


def sheets():
    items = [c for c in read(OUT / "processed.json") if c.get("mediaStatus") == "verified"]
    index = []
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
    small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)
    for source in sorted({c["sourceKey"] for c in items}):
        batch = sorted([c for c in items if c["sourceKey"] == source], key=lambda c: c["id"])
        per_page = 20 if source != "rapidata-videos" else 10
        for offset in range(0, len(batch), per_page):
            group = batch[offset:offset+per_page]
            video = source == "rapidata-videos"
            cols, cell_w, cell_h = (2, 660, 185) if video else (4, 330, 255)
            canvas = Image.new("RGB", (cols * cell_w, math.ceil(len(group) / cols) * cell_h + 40), "#f5f5f3")
            draw = ImageDraw.Draw(canvas)
            page = f"{source}-{offset//per_page+1:02d}.jpg"
            draw.text((12, 8), page, fill="#161616", font=font)
            for n, c in enumerate(group):
                x, y = (n % cols) * cell_w, (n // cols) * cell_h + 40
                paths = [OUT / "frames" / (c["id"] + f"-{k}.jpg") for k in range(3)] if video else [MEDIA / (c["id"] + ".webp")]
                for k, path in enumerate(paths):
                    with Image.open(path) as image:
                        image = ImageOps.contain(image.convert("RGB"), (210, 125) if video else (318, 205))
                        canvas.paste(image, (x + 5 + (k * 215 if video else (318-image.width)//2), y + 3))
                draw.text((x+7, y+(132 if video else 211)), c["id"], fill="#202020", font=small)
                title = c.get("title", c["originalPrompt"])
                draw.text((x+7, y+(150 if video else 229)), title[:85 if video else 40], fill="#404040", font=small)
                index.append({"id": c["id"], "page": page, "cell": n+1})
            canvas.save(SHEETS / page, quality=90)
    dump(OUT / "sheet-index.json", index)
    print("SHEETS", len({x["page"] for x in index}), "ITEMS", len(index))


def export():
    processed = {c["id"]: c for c in read(OUT / "processed.json")}
    decisions = read(DATA / "editorial-decisions.json", {})
    exclusions = read(DATA / "exclusions.json", {})
    seen_sha, seen_pixels, seen_prompt, frame_signatures = {}, {}, {}, {}
    dedup = []
    accepted, catalog = [], []
    for identifier, decision in decisions.items():
        if decision.get("decision") != "accept":
            continue
        c = dict(processed[identifier])
        assert c.get("mediaStatus") == "verified", identifier
        assert c["licenseStatus"].startswith("verified"), identifier
        assert c.get("status") != "pending-provenance", identifier
        norm = " ".join((c["originalPrompt"] or c["id"]).lower().split())
        reason = None
        if c["originalSha256"] in exclusions.get("parentOriginalSha256", []):
            reason = "parent-original-hash"
        elif c["originalAssetUrl"] in exclusions.get("oldTemplateAssetUrls", []):
            reason = "existing-template-asset-url"
        elif sha(norm.encode()) in exclusions.get("oldTemplatePromptSha256", []):
            reason = "existing-template-prompt"
        elif c["originalSha256"] in seen_sha:
            reason = "exact-original:" + seen_sha[c["originalSha256"]]
        elif c.get("pixelSha256") in seen_pixels:
            reason = "identical-decoded-pixels:" + seen_pixels[c["pixelSha256"]]
        elif norm in seen_prompt:
            reason = "same-normalized-prompt:" + seen_prompt[norm]
        elif c.get("frameHashes") and tuple(c["frameHashes"]) in frame_signatures:
            reason = "same-video-frame-sequence"
        if reason:
            dedup.append({"id": identifier, "reason": reason})
            continue
        seen_sha[c["originalSha256"]] = identifier
        if c.get("pixelSha256"):
            seen_pixels[c["pixelSha256"]] = identifier
        seen_prompt[norm] = identifier
        if c.get("frameHashes"):
            frame_signatures[tuple(c["frameHashes"])] = identifier
        c.update({k: v for k, v in decision.items() if k != "decision"})
        c.update(status="verified-editorial-accepted", naumiPrompt=c["prompt"], naumiPromptProvenance="editorial-rewrite-not-reproduction", naumiGenerationVerified=False)
        accepted.append(c)
        entry = {k: c[k] for k in ["id", "kind", "title", "category", "tags", "poster", "width", "height", "prompt", "steps"]}
        if c["kind"] == "video":
            entry.update(video=c["video"], duration=c["duration"])
        entry["source"] = {"title": {"gpt4o": "Awesome GPT-4o Images", "rapidata-images": "Rapidata · 公开图片成品", "rapidata-videos": "Rapidata · 公开短片成品", "diffusiondb": "DiffusionDB · 公开创作", "blender-open-movies": "Blender · 开放叙事短片", "pepper-carrot": "Pepper & Carrot · 漫画改编动画"}[c["sourceKey"]], "author": c["author"], "url": c["sourcePage"], "license": c["license"], "licenseUrl": c["licenseBasisUrl"]}
        if c.get("promptAuthor"):
            entry["source"]["promptAuthor"] = c["promptAuthor"]
        transformed = "完整叙事作品的浏览版，保留音轨和片尾；方法为分镜改写。" if c.get("narrative") else ("原图转为 WebP 浏览版，未裁切构图。" if c["kind"] == "image" else "完整独立短片转为静音浏览版，未裁切或拆分镜头。")
        entry["adaptation"] = "公开来源成品，非 Naumi 生成记录。" + transformed + "提示词由 Naumi 编辑改写，未验证复现。"
        catalog.append(entry)
    dump(DATA / "catalog.json", catalog)
    dump(DATA / "verified-cases.json", accepted)
    dump(DATA / "dedup-report.json", {"excludedParentItems": exclusions.get("parentIds", []), "rejectedDuplicates": dedup, "accepted": len(accepted), "checks": ["original SHA256", "decoded pixels SHA256", "normalized prompt", "source URL", "sampled video frame sequence", "manual contact-sheet review"], "oldTemplateMediaHashCoverage": exclusions.get("oldTemplateMediaHashCoverage")})
    dump(PACKAGE / "catalog.json", catalog)
    dump(PACKAGE / "ATTRIBUTION.json", {"retrievedAt": NOW(), "items": accepted})
    accepted_ids = {c["id"] for c in accepted}
    statuses = []
    for c in read(DATA / "candidates.json"):
        p = processed.get(c["id"], c)
        status = "accepted" if c["id"] in accepted_ids else decisions.get(c["id"], {}).get("decision", p["status"])
        statuses.append({"id": c["id"], "kind": c["kind"], "sourceKey": c["sourceKey"], "status": status, "reason": decisions.get(c["id"], {}).get("reason", p.get("reason", p.get("failure")))})
    dump(DATA / "candidate-status.json", statuses)
    counts = {"candidates": len(statuses), "accepted": len(accepted), "images": sum(c["kind"] == "image" for c in accepted), "videos": sum(c["kind"] == "video" for c in accepted), "sources": dict(collections.Counter(c["sourceKey"] for c in accepted)), "categories": dict(collections.Counter(c["category"] for c in accepted)), "statuses": dict(collections.Counter(c["status"] for c in statuses)), "naumiGenerationVerified": 0}
    dump(DATA / "summary.json", counts)
    with (DATA / "cases.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = ["id", "kind", "title", "category", "author", "sourcePage", "originalAssetUrl", "license", "licenseBasisUrl", "licenseStatus", "retrievedAt", "originalSha256", "originalWidth", "originalHeight", "duration", "poster", "video", "originalPrompt", "naumiPrompt", "transform"]
        writer = csv.DictWriter(f, fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(accepted)
    print("EXPORT", json.dumps(counts, ensure_ascii=False))


def verify():
    cases = read(DATA / "verified-cases.json")
    catalog = read(DATA / "catalog.json")
    assert len(cases) == len(catalog)
    assert len({c["id"] for c in cases}) == len(cases)
    assert len({c["originalSha256"] for c in cases}) == len(cases)
    for c in cases:
        assert file_sha(ROOT / c["originalLocalPath"]) == c["originalSha256"], c["id"]
        poster = PACKAGE / "public" / c["poster"].lstrip("/")
        with Image.open(poster) as image:
            image.load()
        assert file_sha(poster) == c["posterSha256"]
        assert c["prompt"] != c["originalPrompt"]
        assert c["naumiGenerationVerified"] is False
        assert (DATA / c["licenseEvidenceFile"]).exists()
        if c["kind"] == "video":
            video = PACKAGE / "public" / c["video"].lstrip("/")
            run(["ffmpeg", "-v", "error", "-xerror", "-threads", "2", "-i", video, "-f", "null", "-"])
            raw = video.read_bytes()
            assert raw.find(b"moov") < raw.find(b"mdat"), c["id"]
    result = {"result": "PASS", "cases": len(cases), "images": sum(c["kind"] == "image" for c in cases), "videos": sum(c["kind"] == "video" for c in cases), "allOriginalHashes": "PASS", "allPostersDecoded": "PASS", "allVideosFullyDecoded": "PASS", "allVideoFaststart": "PASS", "generationCalls": 0}
    dump(DATA / "media-verification.json", result)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["discover", "media", "sheets", "export", "verify"])
    parser.add_argument("--video-limit", type=int, default=150)
    args = parser.parse_args()
    {"discover": discover, "media": lambda: media(args.video_limit), "sheets": sheets, "export": export, "verify": verify}[args.command]()
