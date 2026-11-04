# PR #28: blocking review fixes

This supersedes earlier readiness statements. **Not ready to merge as a working
production release system.** No production or Preview deployment is authorized.
PR #23 must not be redeployed: reviewed src/public/migrations match production
commit d39ddf632b2279573216ac81d536a7e6f0fcc240.

## Implemented safety corrections

- Builds discovery uses the official Worker-specific listByScript endpoint,
  follows full pages and rejects malformed/repeated pagination. Only stopped
  builds with a documented terminal outcome count as idle. API failures retain
  numeric HTTP/Cloudflare diagnostics and never count as an empty build list.
- Failed recovery retains the write barrier for code-only and schema releases,
  including inspection, activation, verification and barrier errors.
- Artifact receipts bind repository, exact source/operator SHA, sealed file
  manifest SHA256, account digest, Cloudflare version UUID + opaque script etag,
  configuration digest and pinned upload toolchain. Verification requires GitHub
  Sigstore attestations from a fixed signer workflow at the approved operator
  digest. APP_BUILD is only a health label. Both target and fallback require
  independent receipts. The production adapter cannot accept an alternate signer
  or injected attestation verifier through artifact options.
- Configuration comparison includes every returned binding and runtime field,
  including translation/AI flags. Exceptions are exact reviewed path/from/to
  operations in the hashed plan, never wildcards. Secret contents are excluded;
  names/types alone do not prove secret-value equality (see limitations below).
- Manual production workflow pins operator checkout, verifies main protection,
  environment required reviewers/prevent-self-review, and actual run approvals
  by the repository owner, independent of dispatch actors. Exact plan digest
  covers SHAs, source/target/fallback UUIDs, D1 schema, migration bytes digest,
  artifact digests and configuration exceptions. Text confirmation alone cannot
  authorize anything. No environment or branch settings are changed.
- Database-enforced triggers reject late INSERT/UPDATE/DELETE statements even
  if admitted/prepared before fencing. The isolated delayed-write test covers
  foreground and waitUntil background writes plus a committed-before row in the
  snapshot. Only newly owned synthetic audit D1 is fenced and cleaned up.

## Deliberate production blockers / remaining work

The present application writes to D1 and R2 and starts background operations
without a common enforceable writer admission/epoch protocol. HTTP 503 and a
sleep cannot prove drain. The production adapter and manual workflow therefore
fail with ALL_WRITERS_FENCE_NOT_PROVEN before production mutation, including
code-only releases. The workflow contains no Cloudflare credentials or deploy
step. D1 trigger tests do **not** certify a global R2/D1 fence.

The sealed uploader currently permits only a newly owned audit Worker. There is
no enabled production artifact producer. Production verifier trusts only the
reserved prepare-worker-artifact.yml identity; isolated-drill attestations are
not production evidence. Existing versions without trusted upload receipts must
be rejected. Enabling a protected producer, proving reproducible candidate build
inputs and secret binding identity, and demonstrating the all-writer protocol
remain prerequisites. Do not bypass these gates with text approvals or relax
signer identity. GitHub protection settings have not been configured or tested
by a production dispatch.

## Verification boundaries

The isolated workflow uses at most one temporary D1 shared serially by all four
release/recovery cases. Capacity is checked before allocation; existing databases
are never adopted or removed. Artifact proof uses an additional owned Worker,
**zero** extra D1 databases, and separate always-run ownership-checked cleanup.
Real cloud results and exact run links must accompany review; local tests alone
are not cloud evidence.

### Observed run fce5f4b / 41913357348

- Correct Builds API: PASS, 766 builds read, 0 active.
- Delayed foreground D1 write: passed; background result lookup failed, so the
  combined fence test reported FAIL and no release scenarios ran. In-memory
  result handoff cannot cross Worker isolates. The follow-up uses Cache API for
  test evidence only and still rejects unavailable evidence rather than PASS.
- Always-run D1 and Worker cleanup: PASS.
- GitHub Issues create/update/close/readback verification: PASS.
- Artifact steps were skipped after the failed D1 step; no artifact cloud PASS
  is claimed for this run.

Secret names/types are compared without logging secret values. Production
additionally fails with SECRET_CONFIGURATION_UNVERIFIABLE for secret_text
bindings because Cloudflare does not expose immutable value identity here.
