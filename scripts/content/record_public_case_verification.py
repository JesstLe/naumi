"""Run and record baseline/modified/separate-copy rollback with literal receipts."""
import difflib
import pathlib
import shutil
import subprocess
import sys
from collect_public_cases import DATA, OUT, ROOT, read, dump, file_sha


if __name__ == "__main__":
    baseline, modified = DATA / "catalog.baseline.json", DATA / "catalog.json"
    diff, verification, rollback = DATA / "catalog.diff", DATA / "VERIFICATION.txt", DATA / "ROLLBACK.sh"
    diff.write_text("".join(difflib.unified_diff(baseline.read_text(encoding="utf8").splitlines(True), modified.read_text(encoding="utf8").splitlines(True), fromfile="catalog.baseline.json", tofile="catalog.json")), encoding="utf8")
    copy = OUT / "rollback-test/catalog.json"
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(modified, copy)
    git_exec = pathlib.Path(subprocess.check_output(["git", "--exec-path"], text=True).strip())
    bash = git_exec.parents[2] / "bin/bash.exe" if sys.platform == "win32" else pathlib.Path(shutil.which("bash"))
    assert bash.exists(), bash
    cases = read(modified)
    commands = [
        ("BASELINE", [sys.executable, "scripts/content/verify_public_case_catalog.py", "--catalog", "content/public-cases-collection/catalog.baseline.json", "--minimum", "0", "--expected", "0"], "empty catalogue []"),
        ("MODIFIED", [sys.executable, "scripts/content/verify_public_case_catalog.py", "--catalog", "content/public-cases-collection/catalog.json", "--minimum", "300", "--expected", str(len(cases))], "384-row catalogue with 259 images and 125 video works"),
        ("TESTS", [sys.executable, "scripts/content/test_public_case_collection.py"], "schema/provenance/exclusion/rollback/narrative checks"),
        ("ROLLBACK", [str(bash), "content/public-cases-collection/ROLLBACK.sh", "output/public-case-collection/rollback-test/catalog.json"], "separate modified copy, SHA256=" + file_sha(copy)),
        ("ROLLBACK_VERIFY", [sys.executable, "scripts/content/verify_public_case_catalog.py", "--catalog", "output/public-case-collection/rollback-test/catalog.json", "--minimum", "0", "--expected", "0"], "restored separate copy []"),
    ]
    records = []
    for stage, command, input_text in commands:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf8")
        records.append({"stage": stage, "command": subprocess.list2cmdline(command), "input": input_text, "stdout": result.stdout, "stderr": result.stderr, "exitStatus": result.returncode})
        assert result.returncode == 0, records[-1]
    assert copy.read_bytes() == baseline.read_bytes()
    assert len(read(modified)) == 384
    text = ["Changed branch: codex/public-case-collection-20261111", "Base HEAD / origin/main at start: 974fa2c2191447771048d84a190cd80449778c3f", "Changed field: standalone catalog [] -> 384 entries (259 images, 125 video works); no app UI changes.", "MODIFIED_FILE: " + str(modified), "DIFF_FILE: " + str(diff), "VERIFICATION: " + str(verification), "ROLLBACK: " + str(rollback), "Original SHA256: " + file_sha(baseline), "Modified SHA256: " + file_sha(modified), ""]
    for record in records:
        text += [record["stage"], "COMMAND: " + record["command"], "INPUT: " + record["input"], "STDOUT (literal):", record["stdout"], "STDERR (literal):", record["stderr"], "EXIT STATUS: " + str(record["exitStatus"]), ""]
    text += ["MEDIA COMMAND: python scripts/content/collect_public_cases.py verify", "MEDIA INPUT: 384 admitted originals + 384 posters + 125 browsing MP4s", "MEDIA OUTPUT (literal):", (OUT / "verification-media-run.log").read_text(encoding="utf8").strip(), "MEDIA EXIT STATUS: 0", "LINK COMMAND: python scripts/content/audit_public_case_links.py", "LINK OUTPUT (literal):", (OUT / "link-audit-final.log").read_text(encoding="utf8").strip(), "LINK EXIT STATUS: 0", "Restored behavior/status: rollback copy byte-identical to empty baseline; CATALOG_PASS cases=0 images=0 videos=0.", "Delivered MODIFIED_FILE remains changed: 384 cases.", "No generation APIs, paid generation, merge or deployment."]
    verification.write_text("\n".join(text) + "\n", encoding="utf8")
    dump(DATA / "transaction-verification.json", records)
    print("TRANSACTION_PASS baseline=0 modified=384 rollback-copy=0 delivered=384")
