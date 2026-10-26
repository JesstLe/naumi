#!/usr/bin/env python3
"""Branch hygiene inspection for the multi-agent collaboration v2 rules.

Reports, against origin/main:
  1. branches already merged but not deleted (zombie branches)
  2. branches older than 48h (by first commit date) not yet merged (red line)
  3. worktrees whose branch is already merged (zombie worktrees)

Usage: python scripts/ops/branch_hygiene.py [--max-age-hours 48] [--json]
"""
import argparse, json, subprocess, sys
from datetime import datetime, timezone, timedelta


def git(*args: str) -> str:
    out = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-age-hours", type=int, default=48)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    git("fetch", "origin", "main", "--quiet")
    main_sha = git("rev-parse", "origin/main").strip()
    now = datetime.now(timezone.utc)

    branches = []
    for line in git("for-each-ref", "--format=%(refname:short)%09%(committerdate:iso8601)", "refs/heads/codex", "refs/heads/t3").splitlines():
        if not line.strip():
            continue
        name, last_date = line.split("\t", 1)
        merged = subprocess.run(["git", "merge-base", "--is-ancestor", name, "origin/main"]).returncode == 0
        unique = git("log", "--reverse", "--format=%cI", f"origin/main..{name}").splitlines()
        first = unique[0] if unique else last_date
        age_hours = (now - datetime.fromisoformat(first)).total_seconds() / 3600
        branches.append({
            "branch": name, "merged_into_main": merged,
            "age_hours": round(age_hours, 1),
            "status": "zombie-merged" if merged else ("overdue" if age_hours > args.max_age_hours else "active"),
        })

    zombie_worktrees = []
    for line in git("worktree", "list", "--porcelain").splitlines():
        if line.startswith("worktree "):
            path = line.split(" ", 1)[1]
        elif line.startswith("branch "):
            branch = line.split(" ", 1)[1].replace("refs/heads/", "")
            info = next((b for b in branches if b["branch"] == branch), None)
            if info and info["merged_into_main"]:
                zombie_worktrees.append({"worktree": path, "branch": branch})

    report = {
        "generated_at": now.isoformat(),
        "origin_main": main_sha[:10],
        "max_age_hours": args.max_age_hours,
        "summary": {
            "total_branches": len(branches),
            "zombie_merged": sum(1 for b in branches if b["status"] == "zombie-merged"),
            "overdue": sum(1 for b in branches if b["status"] == "overdue"),
            "zombie_worktrees": len(zombie_worktrees),
        },
        "branches": branches,
        "zombie_worktrees": zombie_worktrees,
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        s = report["summary"]
        print(f"origin/main {report['origin_main']} · branches {s['total_branches']} · 已合并未删 {s['zombie_merged']} · 超龄({args.max_age_hours}h)未合并 {s['overdue']} · 僵尸worktree {s['zombie_worktrees']}")
        for b in branches:
            if b["status"] != "active":
                print(f"  [{b['status']}] {b['branch']} ({b['age_hours']}h)")
        for w in zombie_worktrees:
            print(f"  [zombie-worktree] {w['worktree']} -> {w['branch']}")
    sys.exit(0 if (s["zombie_merged"] == 0 and s["zombie_worktrees"] == 0) else 1)


if __name__ == "__main__":
    main()
