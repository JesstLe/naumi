"""Verify documentation completeness and source pointers; no product runtime tests."""
from pathlib import Path
from collections import Counter
import json
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8")

def tree(ref):
    result = {}
    for line in git("ls-tree", "-r", "-z", ref).split("\0"):
        if not line: continue
        meta, name = line.split("\t", 1)
        result[name] = meta.split()[2]
    return result

def main():
    data = json.loads((HERE / "inventory.json").read_text(encoding="utf-8"))
    caps = json.loads((HERE / "capabilities.json").read_text(encoding="utf-8"))
    interfaces = json.loads((HERE / "interfaces.json").read_text(encoding="utf-8"))
    commits = json.loads((HERE / "commits.json").read_text(encoding="utf-8"))
    base, fusion, current = data["base"], data["fusion"], data["main"]
    assert caps["main"] == interfaces["main"] == current
    assert caps["fusion"] == interfaces["fusion"] == fusion
    assert subprocess.run(["git", "merge-base", "--is-ancestor", fusion, current], cwd=ROOT).returncode == 0
    assert int(git("rev-list", "--count", f"{current}..{fusion}")) == data["fusion_only_commit_count"] == 0
    expected_paths = set(git("diff", "--name-only", "--no-renames", base, fusion).splitlines())
    rows = data["files"]
    assert len(rows) == len(expected_paths) == data["counts"]["files"]
    assert set(r["path"] for r in rows) == expected_paths
    trees = {"base_blob": tree(base), "fusion_blob": tree(fusion), "main_blob": tree(current)}
    for row in rows:
        for field, t in trees.items(): assert row[field] == t.get(row["path"]), (field, row["path"])
        expected_state = ("main相同" if row["fusion_blob"] and row["fusion_blob"] == row["main_blob"] else
                          "main后续修改" if row["fusion_blob"] and row["main_blob"] else
                          "main已移除或迁移" if row["fusion_blob"] else
                          "分支删除后main重新出现" if row["main_blob"] else "分支删除后main仍无")
        assert row["main_state"] == expected_state
    assert Counter(r["main_state"] for r in rows) == data["counts"]["by_main_state"]
    assert Counter(r["domain"] for r in rows) == data["counts"]["by_domain"]
    assert len(commits) == int(git("rev-list", "--count", f"{base}..{fusion}")) == data["counts"]["commits"]
    assert set(r["sha"] for r in commits) == set(git("rev-list", f"{base}..{fusion}").splitlines())
    original = {f"V{i:02}" for i in range(1,25)} | {f"P{i:02}" for i in range(1,9)} | {"S01","S02"}
    all_ids = {r["id"] for r in caps["capabilities"]}
    assert len(all_ids) == len(caps["capabilities"]) == 43 and original.issubset(all_ids)
    source = {}
    anchors = 0
    for row in caps["capabilities"]:
        for e in row["evidence"]:
            if e["file"] not in source: source[e["file"]] = git("show", f"{current}:{e['file']}").splitlines()
            assert e["anchor"] in source[e["file"]][e["line"]-1], e
            assert f"/{current}/" in e["url"] and e["url"].endswith(f"#L{e['line']}")
            anchors += 1
        for file in row["test_files"]: assert file in trees["main_blob"]
    assert len({r['path'] for r in interfaces['routes']}) == len(interfaces['routes']) == 29
    assert all(r['methods'] for r in interfaces['routes'])
    assert len({r['name'] for r in interfaces['agent_tools']}) == 27
    assert len(interfaces['profiles']['fusion']) == 44 and len(interfaces['profiles']['main']) == 53
    assert not interfaces['profiles']['removed_after_fusion']
    assert all(not name.endswith('_idx') for name in interfaces['tables']), 'Indexes must not be counted as tables'
    assert len(interfaces['exports']) == 561
    for row in data['current_video_files']: assert row['main_blob'] == trees['main_blob'][row['path']]
    docs = [ROOT / 'docs/CANVAS_CAPABILITY_ADAPTATION.md', *HERE.glob('*.md')]
    links = 0
    for doc in docs:
        text = doc.read_text(encoding='utf-8')
        assert '\ufffd' not in text, f'Encoding replacement in {doc}'
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(('https://','http://','#','mailto:')): continue
            filename = target.split('#',1)[0]
            if filename:
                assert (doc.parent / filename).resolve().exists(), (doc.name, target)
                links += 1
    policy = (ROOT / 'docs/CANVAS_CAPABILITY_ADAPTATION.md').read_text(encoding='utf-8')
    assert all(term in policy for term in ['用户于 2026-10-27', '成熟能力和业务流程', '不是移植', '3D 导演台 ≠ 3D 产品工作台', '后续 Agent 接手提示'])
    assert 'docs/CANVAS_CAPABILITY_ADAPTATION.md' in (ROOT / 'AGENTS.md').read_text(encoding='utf-8')
    changed = set(git('diff', '--name-only', current).splitlines())
    changed |= set(git('ls-files', '--others', '--exclude-standard').splitlines())
    assert all(name == 'AGENTS.md' or name == 'docs/CANVAS_CAPABILITY_ADAPTATION.md' or name.startswith('docs/analysis/canvas-fusion-20261027/') or name == 'docs/changes/2026-10-27-canvas-fusion-inventory.md' for name in changed), changed
    print(f"DOC_AUDIT=PASS FILES={len(rows)} COMMITS={len(commits)} ORIGINAL_CAPABILITIES=34 TOTAL_CAPABILITIES=43 SOURCE_ANCHORS={anchors} ROUTES=29 AGENT_TOOLS=27 PROFILES=53 EXPORTS=561 LOCAL_LINKS={links} BUSINESS_SOURCE_CHANGES=0 RUNTIME_TESTS=0")

if __name__ == '__main__': main()
