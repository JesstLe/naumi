#!/usr/bin/env bash
set -euo pipefail

target="${1:-docs/VIDEO_SUBSYSTEM_REWRITE_PLAN.md}"
patch_file="${2:-audit-artifacts/video-subsystem-rewrite-20260928/VIDEO_SUBSYSTEM_REWRITE_PLAN.patch}"
expected_sha256="7727b6072ba98a0800dbab0d577e247db7c59ad4073ffcf6593dded92519c18c"

if [[ ! -f "$patch_file" ]]; then
  echo "ROLLBACK_RESULT=FAIL missing_patch=$patch_file"
  exit 2
fi

if [[ ! -f "$target" ]]; then
  echo "ROLLBACK_RESULT=PASS already_absent=$target"
  exit 0
fi

actual_sha256="$(sha256sum "$target" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "ROLLBACK_RESULT=FAIL hash_mismatch=$actual_sha256"
  exit 4
fi

rm -- "$target"

if [[ -e "$target" ]]; then
  echo "ROLLBACK_RESULT=FAIL target_still_exists=$target"
  exit 3
fi

echo "ROLLBACK_RESULT=PASS removed=$target"
