# Universal Apple Shortcut — experimental signing page (2026-10-23)

## URL
https://mapkepp.github.io/tools/studio/universal/

## Purpose
Get a Yandex OAuth token through the **existing official Yandex ID flow**, return safely to the experiment, then sign the **exact reviewed native v3 fixture**. No browser voice recognition. The final product remains a signed native Apple Shortcut for Siri / Apple Watch.

## Changes performed
- `studio/universal/index.html` — self-contained experiment page, token copy + unsigned v3 upload + consent + lab signing + verified AEA1 download.
- `studio/app.js` — 18 guarded added lines for a sessionStorage-only OAuth handoff. Existing OAuth callback remains unchanged. The handoff is triggered only by the experimental page's time-bounded `mapkepp.universal.oauth.pending.v1` marker and a fresh state-verified token.
- New **separate** Supabase Edge Function `shortcut-sign-lab`, v1, ACTIVE. The production `shortcut-sign` function is untouched. The laboratory accepts **only** a 65,008-byte file with SHA-256 `d1126dbc86a4cd57a45652ab86ccb6657752bd98102cdf610e6c1961e78ed4ed` and `bplist00` header, signs through documented Shortcuty API, checks AEA1 and upstream hashes, then streams signed bytes back.
- The lab never accepts arbitrary user-selected files, real device IDs or files with embedded tokens. v3 contains synthetic ID examples and import-time token placeholder.

## Security
- OAuth state is random, verified by existing callback; browser-to-browser handoff via same-tab sessionStorage. Token is never in site URL, page HTML, GitHub, logs or signing request.
- User can deliberately copy token to clipboard; the clipboard persists until cleaned. Token resides in memory only on experimental page and is discarded on pagehide.
- Explicit consent is required before uploading the unsigned fixture to signing service. Signed import asks user for their token; never re-share a configured Shortcut.
- Signing function is callable without Supabase JWT because the browser cannot obtain such a JWT; Origin and **exact hardcoded file digest** prevent signing of arbitrary requests but **do not** authenticate or rate-limit callers. Abuse quota risks remain; monitor as future work.
- No changes to `index.html`, `studio/frozen-2026-10-23/**`, `oauth/callback.html`, or production `shortcut-sign`.
- Restorable source baseline: `backup/prod-locked-2026-10-23-1337` at `c7b8e61fb1580b7c6df8010e56da192ca9f6b70e`.

## Verification
PASS: GitHub page added, repo changes limited to `studio/app.js` and new `studio/universal/index.html`.
PASS: current main homepage blob `eea1eadfc612a1edd041ec5252e853c8deb4f8d0` unchanged; frozen signer blob `fe8c39ebf165ec326aceb08cc6443f887e2fb348` unchanged.
PASS: syntax checks of inline page JS and modified Studio JS using V8 `new Function`.
PASS: Supabase reports `shortcut-sign-lab` version 1 ACTIVE.
NOT_TESTED: real browser GitHub Pages availability (web fetch returned inaccessible), Yandex login roundtrip, external Shortcuty signing v3, AEA1 iPhone import, Apple Watch execution. Do not call these PASS.
NOT_SUPPORTED: arbitrary/unreviewed upload signing, automatic personalized universal Shortcuts, free dialogue with Alice through official IoT API.

## Recovery
If the experimental OAuth handoff interferes with Studio, revert only the 18-line block in `studio/app.js` (commit `77e8a429ffd385a5bc8d10f1fd88fd99207ca6ee`), leaving frozen homepage untouched. To disable lab signer, remove or disable `shortcut-sign-lab` in Supabase; production signer is unaffected.

## Next gates
1. Confirm the Pages URL loads on Safari and desktop.
2. Verify the OAuth callback returns to /studio/universal/ and token is copied successfully.
3. Sign hash-approved v3, check signed AEA1 signature and iPhone import.
4. Replace synthetic device IDs with user-approved actual inventory after robust binary plist encoding; do not upload live OAuth tokens for signing.
5. Strengthen rate-limiting and test negative OAuth / signer response paths.
