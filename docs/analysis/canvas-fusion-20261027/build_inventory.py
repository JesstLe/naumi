"""Rebuild fixed-ref documentation evidence; reads Git objects, never executes product code."""
from pathlib import Path
from collections import Counter, defaultdict
import json
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = "3f1aa4a158cfbf47cdfef5e663bc2200ce6fa61e"
FUSION = "6dd5d51b379ad5b6fe1ed1244c08d239f30c59b5"
MAIN = "4e15e71a2d56ba8518340c04a256cf920b978e41"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8")

def tree(ref):
    result = {}
    for record in git("ls-tree", "-r", "-z", ref).split("\0"):
        if not record:
            continue
        meta, path = record.split("\t", 1)
        mode, kind, oid = meta.split()
        result[path] = {"mode": mode, "kind": kind, "oid": oid}
    return result

def domain(path):
    if path.startswith("src/lib/video/providers/"): return "视频供应商适配"
    if path.startswith("src/lib/video/"): return "视频领域与任务媒体"
    if path.startswith("src/components/canvas/video/"): return "画布视频界面"
    if path.startswith("src/app/api/video/") or path.startswith("src/app/api/canvas/video-"): return "视频HTTP入口"
    if path.startswith(("src/components/video/", "src/app/video/")): return "独立视频工作台"
    if path.startswith("src/") and ("canvas" in path or "workflow" in path): return "画布与工作流共享集成"
    if path.startswith("src/") and "agent" in path: return "Agent共享集成"
    if path.startswith("src/") and ("billing" in path or "credit" in path): return "计费共享集成"
    if path.startswith("src/") and ("model" in path or "supplier" in path): return "模型供应商管理共享集成"
    if path.startswith("src/") and any(x in path for x in ("media", "storage", "artwork", "upload", "db.ts")): return "数据库媒体共享集成"
    if path.startswith("src/"): return "其他应用代码(不默认归因于视频融合)"
    if path.startswith("docs/licenses/") or "LICENSE" in path: return "来源与许可"
    if path.startswith("docs/"): return "文档"
    if path.startswith("scripts/"): return "验证与运维脚本"
    return "构建部署与其他资源"

def is_video_path(path):
    return path.startswith(("src/lib/video/", "src/components/canvas/video/", "src/components/video/", "src/app/video/", "src/app/api/video/", "src/app/api/canvas/video-"))

def commits():
    first = set(git("rev-list", "--first-parent", f"{BASE}..{FUSION}").splitlines())
    rows = []
    for record in git("log", "--format=%H%x09%P%x09%aI%x09%s", f"{BASE}..{FUSION}").splitlines():
        sha, parents, date, subject = record.split("\t", 3)
        rows.append({"sha": sha, "parents": parents.split(), "date": date, "subject": subject, "on_first_parent": sha in first})
    return rows

def main():
    trees = {ref: tree(ref) for ref in (BASE, FUSION, MAIN)}
    base, fusion, current = (trees[ref] for ref in (BASE, FUSION, MAIN))
    commits_rows = commits()
    first_parent_touches = defaultdict(list)
    for commit in commits_rows:
        if commit["on_first_parent"] and len(commit["parents"]) == 1:
            for path in git("diff-tree", "--no-commit-id", "--name-only", "-r", commit["sha"]).splitlines():
                first_parent_touches[path].append(commit["sha"])
    touched = sorted(set(git("diff", "--name-only", "--no-renames", BASE, FUSION).splitlines()))
    reverse_current = defaultdict(list)
    for path, info in current.items():
        reverse_current[info["oid"]].append(path)
    rows = []
    for path in touched:
        b, f, m = base.get(path), fusion.get(path), current.get(path)
        state = ("main相同" if f and m and f["oid"] == m["oid"] else
                 "main后续修改" if f and m else
                 "分支删除后main仍无" if not f and not m else
                 "分支删除后main重新出现" if not f and m else "main已移除或迁移")
        rows.append({"path": path, "domain": domain(path), "base_blob": b["oid"] if b else None,
                     "fusion_blob": f["oid"] if f else None, "main_blob": m["oid"] if m else None,
                     "branch_change": "added" if not b else "deleted" if not f else "modified",
                     "main_state": state, "first_parent_nonmerge_touch_commits": first_parent_touches.get(path, []),
                     "same_blob_other_main_paths": reverse_current.get(f["oid"], []) if f and not m else [],
                     "main_url": f"https://github.com/JesstLe/naumi/blob/{MAIN}/{path}" if m else None})
    video_paths = sorted(path for path in current if is_video_path(path))
    video_index = [{"path": path, "domain": domain(path), "main_blob": current[path]["oid"],
                    "in_fusion_snapshot": path in fusion, "in_branch_net_delta": path in touched,
                    "main_changed_since_fusion": bool(path in fusion and current[path]["oid"] != fusion[path]["oid"])} for path in video_paths]
    result = {"schema_version": 1, "base": BASE, "fusion": FUSION, "main": MAIN,
              "method": "Complete no-renames snapshot delta BASE..FUSION; includes imported main work, not proof of authorship. First-parent nonmerge touches are trace aids only. Main comparisons are Git blob equality, not runtime tests.",
              "fusion_is_ancestor_of_main": subprocess.run(["git", "merge-base", "--is-ancestor", FUSION, MAIN], cwd=ROOT).returncode == 0,
              "fusion_only_commit_count": int(git("rev-list", "--count", f"{MAIN}..{FUSION}")),
              "counts": {"commits": len(commits_rows), "first_parent_commits": sum(x["on_first_parent"] for x in commits_rows),
                         "files": len(rows), "by_main_state": dict(Counter(x["main_state"] for x in rows)),
                         "by_domain": dict(Counter(x["domain"] for x in rows)), "current_video_files": len(video_index)},
              "files": rows, "current_video_files": video_index}
    (HERE / "inventory.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "commits.json").write_text(json.dumps(commits_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# 历史融合分支文件全量台账", "", f"固定 main `{MAIN}`；旧分支 `{FUSION}`；开工基线 `{BASE}`。", "",
             "此表覆盖分支快照相对开工基线的全部净差异，包含期间合入的其他任务；不是视频融合原创代码归因表。first-parent 触及也不证明原创。精确 blob/提交线索见 inventory.json 与 commits.json。", "",
             "| 文件 | 归类 | 分支净变化 | 当前 main |", "|---|---|---|---|"]
    for row in rows:
        url = row['main_url'] or f"https://github.com/JesstLe/naumi/blob/{FUSION}/{row['path']}"
        lines.append(f"| [{row['path']}]({url}) | {row['domain']} | {row['branch_change']} | {row['main_state']} |")
    lines += ["", "## 当前 main 的完整视频模块文件", "", "本节同时纳入旧分支之外后来加入的文件，不把它们误计为当时已实现。", "", "| 文件 | 来源分层 | 分支后修改 |", "|---|---|---|"]
    for row in video_index:
        source = "旧分支快照中已有" if row["in_fusion_snapshot"] else "旧分支之后新增"
        lines.append(f"| `{row['path']}` | {source} | {'是' if row['main_changed_since_fusion'] else '—'} |")
    (HERE / "FILES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(result["counts"], ensure_ascii=False))
    print("FUSION_IN_MAIN=" + str(result["fusion_is_ancestor_of_main"]) + " FUSION_ONLY_COMMITS=" + str(result["fusion_only_commit_count"]))

if __name__ == "__main__":
    main()
