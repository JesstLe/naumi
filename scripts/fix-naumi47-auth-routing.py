#!/usr/bin/env python3
"""Narrow compatibility-map correction. Authentication stays in each original app."""
import re


def render_gateway(before):
    header = 'map "$http_referer|$cookie_nv_user|$cookie_wb_session" $naumi47_compat_api {'
    if before.count(header) != 1:
        raise ValueError('Expected one compatibility map')
    start = before.index(header)
    end = before.index('\n}', start) + 2
    block = before[start:end]
    # Preserve explicit legacy namespaces first, then route all modern same-site
    # pages to native auth. A stale legacy cookie must not win over /dashboard.
    pattern = re.compile(r'(?m)^(\s*)~\^https\?://47\\\.105\\\.59\\\.142/\(\\\?\[\^\|\]\*\)\?\\\| (http://127\.0\.0\.1:[0-9]+);$')
    matches = list(pattern.finditer(block))
    if len(matches) != 1 or 'legacy-workbench/' not in block or '~^[^|]*\\|\\|.+$' not in block:
        raise ValueError('Compatibility baseline changed')
    match = matches[0]
    if block.index('legacy-workbench/') > match.start() or block.index('~^[^|]*\\|\\|.+$') < match.end():
        raise ValueError('Compatibility precedence changed')
    replacement = match.group(1) + r'~^https?://47\.105\.59\.142/[^|]*\| ' + match.group(2) + ';'
    after_block = block[:match.start()] + replacement + block[match.end():]
    return before[:start] + after_block + before[end:]


if __name__ == '__main__':
    import argparse
    import pathlib
    parser = argparse.ArgumentParser(description='Render a corrected copy; never reload Nginx.')
    parser.add_argument('input')
    parser.add_argument('output')
    args = parser.parse_args()
    source = pathlib.Path(args.input)
    destination = pathlib.Path(args.output)
    if source.resolve() == destination.resolve() or destination.exists():
        raise SystemExit('Distinct new output file required')
    destination.write_text(render_gateway(source.read_text(encoding='utf-8')), encoding='utf-8')
    print('NAUMI47_AUTH_MAP_RENDER=PASS INPUT_UNCHANGED=1 NO_PUBLIC_SWITCH=1')
