"""Attach separate live-link, licence-document and original-file receipts."""
import hashlib
import urllib.parse
from datetime import datetime, timezone
from collect_public_cases import ROOT, DATA, OUT, PACKAGE, read, dump, file_sha, run
import json


def main():
    processed = read(OUT / "processed.json")
    lookup = {x["url"]: x for x in read(DATA / "link-audit.json", [])}
    for c in processed:
        c["assetLinkStatus"] = lookup.get(c["originalAssetUrl"], {}).get("status", "NOT_CURRENTLY_MEASURED")
        c["assetLinkCheckedAt"] = lookup.get(c["originalAssetUrl"], {}).get("at")
        c["licenseEvidenceSha256"] = file_sha(DATA / c["licenseEvidenceFile"]) if c.get("licenseEvidenceFile") and (DATA / c["licenseEvidenceFile"]).exists() else None
        if c.get("originalLocalPath"):
            c["retrievedAt"] = datetime.fromtimestamp((ROOT / c["originalLocalPath"]).stat().st_mtime, timezone.utc).isoformat()
        c["sourceResultType"] = "conventional-narrative-work" if c.get("narrative") else "publisher-declared-generated-output"
        if c.get("narrative") and c.get("mediaStatus") == "verified":
            info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", PACKAGE / "public" / c["video"].lstrip("/")]))
            c["mediaVerification"]["audioStreams"] = sum(s["codec_type"] == "audio" for s in info["streams"])
            assert c["mediaVerification"]["audioStreams"] > 0
            c["mediaVerification"]["originalDuration"] = c["duration"]
            c["mediaVerification"]["browsingDuration"] = float(info["format"]["duration"])
            assert abs(c["duration"] - float(info["format"]["duration"])) < .25
            if c["sourceKey"] == "pepper-carrot":
                ep = int(c["id"][-2:])
                metadata = read(DATA / f"source-evidence/pepper-carrot-{ep}-metadata.json")
                filename = urllib.parse.unquote(c["originalAssetUrl"].split("/")[-1])
                entry = next(x for x in metadata["files"] if x["name"] == filename)
                actual = hashlib.md5((ROOT / c["originalLocalPath"]).read_bytes()).hexdigest()
                assert actual == entry["md5"]
                c["archiveDeclaredMd5Verified"] = True
    dump(OUT / "processed.json", processed)
    print("EVIDENCE_ENRICHED", len(processed))


if __name__ == "__main__":
    main()
