#!/bin/sh
set -eu
target="${1:-audit-artifacts/video-rewrite-20260928/MODIFIED_FILE.md}"
cp docs/VIDEO_SUBSYSTEM_REWRITE_PLAN.md "$target"
echo ROLLBACK_RESULT=PASS
