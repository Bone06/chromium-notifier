# Release gates

These gates are mandatory for the next release after 4.1.0. They are additional
to existing signing-key, snapshot-history and packaging checks. A green CI run
does not by itself close an audit or production-deployment gate.

## Open blockers (2026-10-22)

- [ ] **Repeat the full audit after the structural refactor.** Review both
  projects at recorded candidate commit hashes, including shared presentation,
  popup lifecycle/settings races, storage compatibility, feed contract and
  freshness, update detection, regression coverage and release packaging.
  Run the unit/integration and isolated browser/accessibility suites and complete
  a manual installed-extension smoke test. Record findings, fixes and retests.
- [ ] **Complete an elevated security audit.** Review trust boundaries and
  adversarial cases, not just dependency vulnerability counts: feed signature,
  key lifetime/rotation, replay and stale-cache handling; untrusted JSON/XML/URLs,
  redirects, private-network and DNS limitations; DOM injection and CSP;
  extension-management permissions/messages; request/resource limits; production
  key/file permissions, atomic publication and rollback; dependencies, CI and
  release artifact contents. Use isolated fixtures/staging for destructive or
  adversarial tests, not the live service. Document limits and residual risks.
  Resolve critical/high findings and all other release-blocking findings before
  release; explicitly assess and record disposition of remaining findings.
- [ ] **Deploy the audited Chromatic Feed changes to production.** The audit
  fixes were pushed as `8e27422` but have not been deployed. Deploy the final
  audited feed candidate through staging with a rollback path, preserving the
  active signer unless a separately agreed rotation is required. Verify Node
  runtime/tests, permissions, generation/publication, external HTTPS feed and
  detached signature, signature verification, ETag/304, source-aware health,
  timers and a successful scheduled publication/health cycle. Verify the
  released client and new notifier candidate against the published feed and
  record the deployed commit and evidence before closing this gate.

## Closure rules

Audit the candidate before deploying it; finish production and client smoke
verification before publishing the extension release. Findings that materially
change audited code require a targeted re-audit and rerun of affected checks.
Closing a gate requires recorded evidence, not merely a planned action.

The known changes do not currently establish a need for an emergency production
update: the feed v1 schema/signature protocol remains compatible, key generation
is an operator CLI, and the other changes harden validation, health reporting and
release selection. This is a code-based assessment, not a live host health check.
Reassess immediately if a production failure or vulnerability is discovered;
compromise must not wait for the normal release schedule.
