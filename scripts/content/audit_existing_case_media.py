"""Read-only existing template/parent media fingerprint audit; inaccessible stays UNKNOWN."""
import concurrent.futures
import hashlib
import io
import json
import pathlib
import threading
import time
import urllib.request

import imagehash
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "content/public-cases-collection"
OUT = ROOT / "output/public-case-collection/existing-media"
LOCK = threading.Lock()
LAST = 0.


def inspect(pair):
    global LAST
    index, url = pair
    path = OUT / f"{index:04d}.bin"
    result = {"index": index, "url": url}
    try:
        if not path.exists():
            if url.startswith("/"):
                source = ROOT / "public" / url.lstrip("/")
                data = source.read_bytes()
            else:
                with LOCK:
                    time.sleep(max(0, .3-(time.monotonic()-LAST)))
                    LAST = time.monotonic()
                req = urllib.request.Request(url, headers={"User-Agent": "Naumi-Public-Case-Research/1.0"})
                with urllib.request.urlopen(req, timeout=22) as response:
                    data = response.read(16*1024*1024+1)
                    if len(data) > 16*1024*1024:
                        raise ValueError("existing-media audit byte budget")
            path.write_bytes(data)
        data = path.read_bytes()
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            im = im.convert("RGB")
            result.update(status="VERIFIED", sha256=hashlib.sha256(data).hexdigest(), pixelSha256=hashlib.sha256(im.tobytes()+str(im.size).encode()).hexdigest(), perceptualHash=str(imagehash.phash(im)), width=im.width, height=im.height)
    except Exception as error:
        result.update(status="UNKNOWN", error=repr(error))
    return result


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ex = json.loads((DATA / "exclusions.json").read_text(encoding="utf8"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(inspect, enumerate(ex["oldTemplateAssetUrls"])))
    (DATA / "existing-media-audit.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf8")
    count = sum(r["status"] == "VERIFIED" for r in rows)
    ex["oldTemplateMediaHashCoverage"] = {"verified": count, "unknown": len(rows)-count, "total": len(rows)}
    (DATA / "exclusions.json").write_text(json.dumps(ex, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps(ex["oldTemplateMediaHashCoverage"]))
