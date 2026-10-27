"""Extract route/tool/profile/table/export indexes from the pinned source snapshot."""
from pathlib import Path
import json
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MAIN = "4e15e71a2d56ba8518340c04a256cf920b978e41"
FUSION = "6dd5d51b379ad5b6fe1ed1244c08d239f30c59b5"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8")

def at(file, line=1):
    return f"https://github.com/JesstLe/naumi/blob/{MAIN}/{file}#L{line}"

def main():
    inventory = json.loads((HERE / "inventory.json").read_text(encoding="utf-8"))
    paths = [row["path"] for row in inventory["current_video_files"]]
    paths += ["src/lib/canvas/video-node-schema.ts", "src/lib/canvas/video-node-service.ts", "src/lib/canvas/video-node-repository.ts", "src/lib/canvas/video-projects.ts", "src/lib/agent/canvas-video-tools.ts", "scripts/video-fusion/media-engine.mjs", "scripts/video-media-worker.mjs"]
    sources = {file: git("show", f"{MAIN}:{file}") for file in paths}
    routes, exports, tables = [], [], {}
    for file, text in sources.items():
        if file.startswith("src/app/api/") and file.endswith("/route.ts"):
            methods = sorted(set(re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b", text)))
            routes.append({"path": "/" + file.removeprefix("src/app/").removesuffix("/route.ts"), "file": file, "methods": methods})
        for i, line in enumerate(text.splitlines(), 1):
            for kind, name in re.findall(r"\bexport\s+(?:async\s+)?(function|class|const|type|interface)\s+([\w$]+)", line):
                exports.append({"file": file, "line": i, "kind": kind, "symbol": name})
            for table in re.findall(r"\b(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE|FROM|JOIN|UPDATE|INTO|REFERENCES)\s+(app_(?:canvas_video|video)[a-z_]*)\b", line, re.I):
                tables.setdefault(table, {"definitions": [], "uses": []})
                key = "definitions" if re.search(r"CREATE TABLE(?: IF NOT EXISTS)?\s+" + re.escape(table) + r"\b", line, re.I) else "uses"
                if not any(e["file"] == file for e in tables[table][key]): tables[table][key].append({"file": file, "line": i})
    tools = []
    agent = sources["src/lib/agent/canvas-video-tools.ts"]
    for i, line in enumerate(agent.splitlines(), 1):
        for name, label in re.findall(r'tool\("([^"]+)","([^"]+)"', line): tools.append({"name": name, "label": label, "line": i})
    profile_file = "src/lib/video/capability-schema.ts"
    def profiles(ref):
        body = git("show", f"{ref}:{profile_file}")
        match = re.search(r"export const VIDEO_WIRE_PROFILES=\[([^]]+)\]", body)
        assert match
        return re.findall(r'"([^"]+)"', match.group(1))
    old, now = profiles(FUSION), profiles(MAIN)
    payload = {"main": MAIN, "fusion": FUSION, "routes": routes, "agent_tools": tools,
               "profiles": {"fusion": old, "main": now, "added_after_fusion": sorted(set(now)-set(old)), "removed_after_fusion": sorted(set(old)-set(now))},
               "tables": tables, "exports": exports}
    (HERE / "interfaces.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# 当前源码接口索引", "", f"固定 main `{MAIN}`。自动提取的源码目录索引，不是运行接口探测；没有调用HTTP或供应商。", "",
             "## HTTP 入口", "", "| 路由 | 声明的方法 | 源码 |", "|---|---|---|"]
    for row in routes: lines.append(f"| `{row['path']}` | {', '.join(row['methods'])} | [源码]({at(row['file'])}) |")
    lines += ["", "## 视频 Agent 工具", "", "下列是实际注册工具，不代表用户所有请求都会调用，亦不证明模型必然遵守制作规则。", "", "| 工具 | 标签 | 定义 |", "|---|---|---|"]
    for row in tools: lines.append(f"| `{row['name']}` | {row['label']} | [canvas-video-tools.ts:{row['line']}]({at('src/lib/agent/canvas-video-tools.ts', row['line'])}) |")
    lines += ["", "## 协议 profile", "", f"旧分支声明 {len(old)} 项；当前声明 {len(now)} 项；新增 {len(set(now)-set(old))} 项，移除 {len(set(old)-set(now))} 项。声明/注册不等于当前账号可调用。", "", "| profile | 来源分层 |", "|---|---|"]
    for name in now: lines.append(f"| `{name}` | {'旧分支已有' if name in old else '之后新增'} |")
    lines += ["", "## 数据归属线索", "", "此处列视频目录、节点服务与Agent文件实际引用的业务表；共享账号、计费、作品和媒体表见总览，不是数据库全库清单。只有读引用时不冒充表定义。", "", "| 表 | 定义或引用 |", "|---|---|"]
    for table, value in sorted(tables.items()):
        entries = value["definitions"] or value["uses"][:2]
        links = "；".join(f"[{e['file']}:{e['line']}]({at(e['file'], e['line'])})" for e in entries)
        lines.append(f"| `{table}` | {'定义' if value['definitions'] else '引用'}：{links} |")
    lines += ["", "## 视频目录与关键集成点的公开符号", "", "词法索引含函数、类型和常量；不是所有函数的动态调用图。完整业务链见总览和能力矩阵。", "", "| 模块 | 符号 | 行 |", "|---|---|---|"]
    for row in exports: lines.append(f"| `{row['file']}` | `{row['kind']} {row['symbol']}` | [{row['line']}]({at(row['file'], row['line'])}) |")
    (HERE / "INTERFACES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"INTERFACE_INDEX=PASS ROUTES={len(routes)} TOOLS={len(tools)} PROFILES_OLD={len(old)} PROFILES_MAIN={len(now)} TABLES={len(tables)} EXPORTS={len(exports)}")

if __name__ == "__main__": main()
