"""GET-only, unauthenticated discovery of explicitly selected models. No generation probes."""
import concurrent.futures
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def collect(manifest_path, output_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    root = Path(output_path)
    root.mkdir(parents=True, exist_ok=True)
    jobs = [("pricing", model["id"], "https://api.apib.ai/api/pricing/model?" + urllib.parse.urlencode({"model": model["id"]})) for model in manifest["models"]]
    jobs += [("documentation", str(i), url + ".md") for i, url in enumerate(sorted({m["documentation"] for m in manifest["models"] if m["documentation"]}))]

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    def get(job):
        kind, model, url = job
        row = {"kind": kind, "modelId": model if kind == "pricing" else None, "url": url, "checkedAt": datetime.now(timezone.utc).isoformat(), "authenticated": False, "method": "GET"}
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Naumi-Public-Discovery/1.0", "Accept": "application/json,text/markdown,text/plain"})
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
                body = response.read(3 * 1024 * 1024 + 1)
                if len(body) > 3 * 1024 * 1024:
                    raise ValueError("RESPONSE_LIMIT_EXCEEDED")
                row["httpStatus"] = response.status
                row["contentType"] = response.headers.get("content-type", "")
            digest = hashlib.sha256(body).hexdigest()
            filename = digest + ".txt"
            (root / filename).write_bytes(body)
            row.update({"sha256": digest, "bytes": len(body), "file": filename})
            if kind == "pricing":
                data = json.loads(body)
                # Raw rates remain source observations, not an automatically inferred procurement price.
                row["success"] = data.get("success") is True
                row["modelMatches"] = isinstance(data.get("data"), dict) and data["data"].get("model_name") == model
                pricing = data.get("data", {}).get("pricing", {}) if isinstance(data.get("data"), dict) else {}
                row["explicitUnit"] = pricing.get("unit")
        except urllib.error.HTTPError as error:
            row["httpStatus"] = error.code
        except Exception as error:
            row["error"] = type(error).__name__ + ": " + str(error)
        return row

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        rows = list(executor.map(get, jobs))
    report = {"source": "APIB public per-model pricing and related APIMart docs", "generationCalls": 0, "authenticatedRequests": 0, "rows": rows}
    (root / "PUBLIC_INDEX.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("PUBLIC_DISCOVERY requests=%d ok=%d generationCalls=0 authenticatedRequests=0" % (len(rows), sum(r.get("httpStatus") == 200 for r in rows)))


if __name__ == "__main__":
    collect(*sys.argv[1:])
