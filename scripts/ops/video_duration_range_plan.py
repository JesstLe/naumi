"""Plan a field-only duration upgrade from pinned smoke and independent research.

No database, HTTP, credentials, pricing, or publication side effects. Resolution
spelling/order and all non-duration fields belong to the installation.
"""
from __future__ import annotations

import copy
import json


def plan_duration_ranges(projection, documented, smoke, witness):
    result = copy.deepcopy(projection)
    patches = []
    seen = set()
    for row in result["rows"]:
        identity = (row["publicId"], row["providerId"], row["model"])
        if row["publicId"] in seen:
            raise ValueError("DUPLICATE_PUBLIC_ID")
        seen.add(row["publicId"])
        match = lambda source: next((item for item in source["items"] if
            (item["publicId"], item["providerId"], item["model"]) == identity), None)
        doc, original = match(documented), match(smoke)
        if doc is None or original is None:
            raise ValueError("UNVERIFIED_MODEL_IDENTITY")
        if row["protocol"] != "apimart" or row["profile"] != original["profile"]:
            raise ValueError("WIRE_PROFILE_CHANGED")
        research = next((item for item in witness["apib"]["proposals"]
                         if item["model"] == row["model"]), None)
        declared = doc["definition"]["durationResolutionMap"]
        if research is None or research["definition"]["durationResolutionMap"] != declared:
            raise ValueError("INDEPENDENT_RESEARCH_DISAGREES")
        before = copy.deepcopy(row["video"]["durationResolutionMap"])
        after = []
        for current in before:
            choices = None
            for resolution in current["resolutions"]:
                allowed = {seconds for item in declared
                           if resolution.lower() in {r.lower() for r in item["resolutions"]}
                           for seconds in item["durations"]}
                if not allowed:
                    raise ValueError("RESOLUTION_NOT_DOCUMENTED")
                choices = allowed if choices is None else choices & allowed
            if not choices or not set(current["durations"]).issubset(choices):
                raise ValueError("CURRENT_DURATION_NOT_DOCUMENTED")
            if not all(type(value) is int and 0 < value <= 3600 for value in choices):
                raise ValueError("NON_POSITIVE_DOCUMENTED_DURATION")
            after.append({**current, "durations": sorted(choices)})
        scoped = row["video"].get("modeParameters") or {}
        if any(value.get("durationResolutionMap") is not None for value in scoped.values()):
            raise ValueError("SCOPED_DURATION_REQUIRES_REVIEW")
        if before == after:
            continue
        if before != original["definition"]["durationResolutionMap"]:
            raise ValueError("ADMIN_DURATION_EDIT_CONFLICT")
        default = row["video"].get("defaultDurationSeconds")
        if default is not None and not any(default in item["durations"] for item in after):
            raise ValueError("DEFAULT_WOULD_CHANGE")
        row["video"]["durationResolutionMap"] = after
        patches.append({"publicId": row["publicId"], "upstreamId": row["upstreamId"],
                        "providerId": row["providerId"], "model": row["model"],
                        "field": "capabilities.video.durationResolutionMap",
                        "before": before, "after": copy.deepcopy(after),
                        "documentation": copy.deepcopy(doc["documentation"])})
    return {"projection": result, "patches": patches}


def rollback_projection(current, patches):
    restored = copy.deepcopy(current)
    for patch in reversed(patches):
        rows = [row for row in restored["rows"] if row["upstreamId"] == patch["upstreamId"]]
        if len(rows) != 1:
            raise ValueError("ROLLBACK_IDENTITY_CONFLICT")
        row = rows[0]
        if (row["publicId"], row["providerId"], row["model"]) != tuple(
                patch[key] for key in ("publicId", "providerId", "model")):
            raise ValueError("ROLLBACK_IDENTITY_CONFLICT")
        if row["video"]["durationResolutionMap"] != patch["after"]:
            raise ValueError("ROLLBACK_FIELD_CHANGED")
        row["video"]["durationResolutionMap"] = copy.deepcopy(patch["before"])
    return restored


if __name__ == "__main__":
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    read = lambda name: json.loads((args.folder / name).read_bytes())
    plan = plan_duration_ranges(read("BASELINE_FILE.json"), read("video-family-capabilities.json"),
                                read("video-family-presets.json"), read("video-node-research.json"))
    (args.folder / "MODIFIED_FILE.json").write_text(
        json.dumps(plan["projection"], ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    (args.folder / "PLAN.json").write_text(json.dumps(plan["patches"], ensure_ascii=False, indent=2), encoding="utf8")
    print(f"PLAN=PASS MODELS={len(plan['projection']['rows'])} DURATION_PATCHES={len(plan['patches'])} OTHER_FIELDS=0")
