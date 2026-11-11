"""Application-independent catalogue contract checker, including empty rollback."""
import argparse
import json
import pathlib

FIELDS = {"id", "kind", "title", "category", "tags", "poster", "width", "height", "prompt", "steps", "source", "adaptation"}


def verify(catalog, minimum=300, expected=None):
    assert isinstance(catalog, list)
    assert len(catalog) >= minimum
    if expected is not None:
        assert len(catalog) == expected
    assert len({x["id"] for x in catalog}) == len(catalog)
    for c in catalog:
        assert FIELDS <= set(c), c.get("id")
        assert c["kind"] in ["image", "video"]
        assert c["title"] and c["prompt"] and len(c["steps"]) >= 3
        assert c["width"] > 0 and c["height"] > 0
        assert c["poster"].startswith("/creation-cases/collection-20261111/")
        assert {"title", "author", "url", "license", "licenseUrl"} <= set(c["source"])
        assert c["source"]["license"] in ["CC-BY-4.0", "CDLA-Permissive-2.0", "Apache-2.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC0-1.0"]
        if c["kind"] == "video":
            assert c["duration"] > 0
            assert c["video"].endswith(".mp4")
    return f"CATALOG_PASS cases={len(catalog)} images={sum(x['kind']=='image' for x in catalog)} videos={sum(x['kind']=='video' for x in catalog)}"


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--catalog", type=pathlib.Path, default=pathlib.Path("content/public-cases-collection/catalog.json"))
    p.add_argument("--minimum", type=int, default=300)
    p.add_argument("--expected", type=int)
    args = p.parse_args()
    print(verify(json.loads(args.catalog.read_text(encoding="utf8")), args.minimum, args.expected))
