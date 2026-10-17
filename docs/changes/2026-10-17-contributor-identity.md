# Contributor identity normalization - 2026-10-17

- Request: retain the owner JesstLe as contributor.
- Repository-local default identity is JesstLe with verified GitHub noreply email.
- Added .mailmap for existing owner aliases Le Jsessy, lv, and names using the same verified noreply address.
- Baseline: 1617 commits represented by five author identities. With mailmap: one canonical JesstLe identity, 1617 commits.
- No commit rewriting, force push, branch deletion, license/notice removal, or deployment.
- GitHub contributors API currently returns JesstLe only (187); screenshot shows an additional account; cache is a possible but unconfirmed cause. Mailmap verification is NOT proof of GitHub sidebar refresh.
- Collaborative browser has no authenticated access to this private repository (Page not found). Sidebar acceptance remains pending.
- GitHub controls contributor aggregation/caches; do not delete/recreate the repository or rewrite active branches to force cosmetic refresh.
- Rollback: revert this task commit; isolated rollback restores the original five-identity shortlog.
- Evidence: output/contributor-identity-20261017/history in the main local checkout.
