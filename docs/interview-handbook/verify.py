"""Dependency-free handbook checks. Run from repo root; no product execution."""

import argparse
from collections import Counter
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


def anchors(text):
    result = set(re.findall(r'<a\s+id="([^"]+)"\s*>', text))
    counts = Counter()
    for heading in re.findall(r"^#{1,6}\s+(.+)$", text, re.M):
        slug = re.sub(r"[^\w\-\s]", "", heading.lower()).replace(" ", "-")
        number = counts[slug]
        counts[slug] += 1
        result.add(slug if not number else f"{slug}-{number}")
    return result


def detailed_section(body, heading):
    match = re.search(r"^#### " + re.escape(heading) + r"[^\n]*\n(.*?)(?=^#### |^### |\Z)", body, re.M | re.S)
    return match.group(1).strip() if match else None


def check(root, expect_absent, require_detailed=False):
    home = root / "docs/interview-handbook"
    if expect_absent:
        if (home / "README.md").exists():
            raise ValueError("HANDBOOK=UNEXPECTED_PRESENT")
        print("HANDBOOK=ABSENT questions=0")
        return
    if not (home / "README.md").is_file():
        raise ValueError("HANDBOOK=MISSING")
    files = sorted(home.rglob("*.md"))
    texts = {file: file.read_text(encoding="utf-8") for file in files}
    questions = {}
    main_answers = 0
    followup_answers = 0
    fields = (
        "现场问题", "旧模型与反例", "基本事实与不变量",
        "推导与参考回答", "L1—L4 追问", "项目证据与验证", "边界与待追问",
    )
    for file, text in texts.items():
        if "\ufffd" in text:
            raise ValueError(f"INVALID_UTF8_TEXT:{file}")
        for match in re.finditer(r"^## (HB-\d{3}) (.+)$", text, re.M):
            identity = match.group(1)
            if identity in questions:
                raise ValueError(f"DUPLICATE_QUESTION:{identity}")
            end = re.search(r"^## HB-\d{3} ", text[match.end():], re.M)
            body = text[match.end():match.end() + end.start()] if end else text[match.end():]
            if any(f"### {field}" not in body for field in fields):
                raise ValueError(f"INCOMPLETE_QUESTION:{identity}")
            if any(f"**L{level}**" not in body and not re.search(rf"^#### L{level}\b", body, re.M) for level in range(1, 5)):
                raise ValueError(f"INCOMPLETE_LEVELS:{identity}")
            if require_detailed:
                for heading in ("直接回答", "从事实推导", "示例与落地", "面试表达"):
                    if detailed_section(body, heading) is None:
                        raise ValueError(f"DETAILED_SECTION_MISSING:{identity}:{heading}")
                direct = detailed_section(body, "直接回答")
                if "**答案：**" not in direct or len(re.sub(r"\s", "", direct)) < 90:
                    raise ValueError(f"MAIN_ANSWER_INCOMPLETE:{identity}")
                main_answers += 1
                levels = re.findall(r"^#### L([1-4])\b", body, re.M)
                if sorted(levels) != ["1", "2", "3", "4"]:
                    raise ValueError(f"DETAILED_LEVELS_MISMATCH:{identity}")
                for level in range(1, 5):
                    answer = detailed_section(body, f"L{level}")
                    if not answer or "**答案：**" not in answer or len(re.sub(r"\s", "", answer)) < 90:
                        raise ValueError(f"FOLLOWUP_ANSWER_INCOMPLETE:{identity}:L{level}")
                    followup_answers += 1
                for heading in ("常见误区", "跨业务迁移"):
                    if f"### {heading}" not in body:
                        raise ValueError(f"DETAILED_FIELD_MISSING:{identity}:{heading}")
            if f'<a id="{identity.lower()}"></a>' not in text:
                raise ValueError(f"MISSING_STABLE_ANCHOR:{identity}")
            questions[identity] = file
    if not questions:
        raise ValueError("NO_QUESTIONS")
    expected = {f"HB-{i:03d}" for i in range(1, len(questions) + 1)}
    if set(questions) != expected:
        raise ValueError("QUESTION_ID_GAP")
    index = (home / "90-growth/question-index.md").read_text(encoding="utf-8")
    indexed = re.findall(r"^\| (HB-\d{3}) \|", index, re.M)
    if set(indexed) != expected or len(indexed) != len(expected):
        raise ValueError("QUESTION_INDEX_MISMATCH")
    if any(identity not in texts[home / "README.md"] for identity in expected):
        raise ValueError("QUESTION_TOC_MISMATCH")
    links = 0
    for file, text in texts.items():
        for raw in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", text):
            url = urlsplit(raw)
            if url.scheme or raw.startswith("//"):
                continue
            target = (file.parent / unquote(url.path)).resolve() if url.path else file
            if not target.is_relative_to(root):
                raise ValueError(f"LINK_OUTSIDE_REPO:{file}:{raw}")
            if not target.exists():
                raise ValueError(f"BROKEN_LINK:{file}:{raw}")
            if url.fragment and target.suffix == ".md":
                if unquote(url.fragment) not in anchors(target.read_text(encoding="utf-8")):
                    raise ValueError(f"BROKEN_ANCHOR:{file}:{raw}")
            links += 1
    print(f"HANDBOOK=PASS questions={len(questions)}")
    print(f"DOCUMENTS={len(files)} LINKS={links} INDEX=PASS LEVELS=PASS")
    if require_detailed:
        print(f"DETAILED=PASS main_answers={main_answers} followup_answers={followup_answers} total={main_answers + followup_answers}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--expect-absent", action="store_true")
    parser.add_argument("--require-detailed", action="store_true", help="Check full main/follow-up answers, not only headings.")
    args = parser.parse_args()
    try:
        check(Path(args.root).resolve(), args.expect_absent, args.require_detailed)
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
