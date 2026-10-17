# Skill read-only acceptance path correction

`check_path(skills)` now permits only GET for exact `/api/image-skills` and
`/api/image-skills/import` paths. The nonexistent `/api/agent/skills` alias is
removed. Acceptance revalidation passes the actual recorded HTTP method to this
guard; the built-in collector remains GET-only. No arbitrary API prefix, trailing
subpath or mutation method is allowed.

Source-backed tests verify both actual route files, list GET export, import
POST-only export and old alias absence. Import GET therefore ordinarily returns
405: this allowlist is not evidence of a working import submission. Existing
accepted status/body checks are unchanged; import POST E2E remains separate.
No business source or production host was modified.
