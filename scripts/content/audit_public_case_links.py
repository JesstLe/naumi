"""Source availability is measured separately from licence declarations."""
import concurrent.futures
import time
import urllib.request
from collect_public_cases import DATA, NOW, read, dump


def head(pair):
    url, roles = pair
    time.sleep(.25)
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Naumi-Public-Case-Research/1.0"})
        with urllib.request.urlopen(req, timeout=35) as response:
            return {"url": url, "roles": roles, "at": NOW(), "httpStatus": response.status, "status": "ACTIVE"}
    except Exception as error:
        return {"url": url, "roles": roles, "at": NOW(), "status": "UNKNOWN", "error": repr(error)}


if __name__ == "__main__":
    urls = {}
    for c in read(DATA / "verified-cases.json"):
        for field in ["originalAssetUrl", "licenseBasisUrl", "sourcePage"]:
            urls.setdefault(c[field], []).append({"id": c["id"], "field": field})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(head, urls.items()))
    dump(DATA / "link-audit.json", results)
    print("LINK_AUDIT", len(results), "ACTIVE", sum(r["status"] == "ACTIVE" for r in results), "UNKNOWN", sum(r["status"] == "UNKNOWN" for r in results))
