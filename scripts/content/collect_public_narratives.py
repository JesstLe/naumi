"""Resume the six separately sourced complete narrative works.

Candidate configuration records the official ZIP distribution or public mirror
URL and exact ZIP member. Author/video licence evidence is kept separately.
"""
import concurrent.futures
from collect_public_cases import DATA, OUT, read, dump, process_one


if __name__ == "__main__":
    candidates = read(DATA / "narrative-candidates.json")
    old = {c["id"]: c for c in read(OUT / "processed.json", [])}
    results = []
    def worker(c):
        if old.get(c["id"], {}).get("mediaStatus") == "verified":
            return old[c["id"]]
        return process_one(c)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for c in pool.map(worker, candidates):
            old[c["id"]] = c
            results.append(c)
            dump(OUT / "processed.json", list(old.values()))
            print(c["id"], c["status"], c.get("duration"), flush=True)
    dump(OUT / "narrative-processed.json", results)
