# Password policy hotfix — prepared, not deployed

Base: production `d880491e4aa53a12a4034f54507582a9d165daf2`, schema 30. This branch does not include research or migration 0031.

## Cause and history

- `72d4dfa00e8957127cb2b5f4ea6f96df850128b6` (12 October 2026): introduced the minimum length of eight characters for voluntary shared-password changes. Login itself did not impose that minimum.
- `d7c7acd62cbea010db577596d7fdae4826919237` (19 October 2026): introduced protected-account credentials, `must_change=1` on explicit initialization/reset, and the global API/page gate requiring an initial password change. It was part of the Astra audit account hardening, not a UI requirement.
- `d67ab702bf9061fce34ee954dc1b8c8d0e8289ff` (19 October 2026): added shared-team-password confirmation to changing a bootstrap credential, intended to prevent taking over a protected account using only its initial credential.

The production source contains these changes. The reported initial-password screen and `PASSWORD_CHANGE_REQUIRED` response match this exact gate. A local reproduction with a credential marked `must_change=1` confirms the cause. No fresh production credential query was made, so the current per-account flags are not asserted here.

## Minimal fix

Valid signed sessions may use the application without a forced initial-password change. Existing credential hashes, versions, account flags, protection triggers and session rows are preserved. The old initial-password URL leads to normal account settings. A voluntary password change verifies the current password, accepts a nonempty value of up to 256 characters, and uses the existing atomic version guard. Existing session revocation occurs only after an explicitly requested successful password change. Protected accounts remain protected; a protected account's separate password is not silently replaced with the shared team credential.

No production credential, account, session or business row has been changed. No production deployment is authorized by this preparation.

## Verification

- 15 targeted password/account/session/language tests: PASS.
- 6 existing Astra regression cases including protected-account behavior: PASS in the earlier targeted run (the password-specific behavior was updated intentionally).
- JavaScript and local-link build validation: PASS.
- The new reproduction asserts that using an existing protected session leaves both credential tables and all existing sessions byte-for-byte unchanged; unsigned requests still receive 401; protected-account deactivation still receives 409.
- Incorrect current passwords and empty new passwords are rejected; voluntary four-character rotation is accepted; other-account sessions remain valid for a protected-account-only change.
- Browser production verification: NOT RUN; no deployment.

## Security assessment

A short dictionary password is weak for an Internet-accessible application. Existing PBKDF2 with a server-side pepper, signed HttpOnly/Secure/SameSite cookies, CSRF checks and an eight-attempts-per-IP limit remain. IP-only throttling does not prevent distributed guessing or protect against a person who already knows the shared password. OWASP recommends substantially longer passwords, especially without MFA. This hotfix follows the explicitly requested team policy and does not claim that policy provides strong authentication. A longer team passphrase or a separate access layer can be considered later with explicit agreement; neither is enabled here.

References: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

PASSWORD HOTFIX READY FOR REVIEW: YES
PRODUCTION DEPLOYED: NO
