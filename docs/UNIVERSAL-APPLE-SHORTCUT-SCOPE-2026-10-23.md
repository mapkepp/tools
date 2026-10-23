# Universal Apple Shortcut · scope lock (2026-10-23)

## User decision
The product is a **generated, signed, installable Apple Shortcut** for Siri / iPhone / Apple Watch. A browser-side Voice Lab and voice-recognition web app are **NOT** the product. Reverted `studio/voice-lab/index.html` from main in commit `a41ae3262f787520041d609d297254bddfdb4829`.

## Production invariants
- NEVER modify `/index.html`, `studio/frozen-2026-10-23/**`, stable signing function, existing examples or production user flows without an explicit separate authorization.
- Production snapshot: `backup/prod-locked-2026-10-23-1337` at `c7b8e61fb1580b7c6df8010e56da192ca9f6b70e`.
- Build and test new actions on branch `experiment/voice-universal-2026-10-23`; deploy only isolated files under `studio/` after checks. Do not touch stable page.
- Do not put OAuth bearer tokens in unsigned shortcut source, signing upload, QR, shared URL, repo or telemetry.

## Proposed target Shortcut behavior
1. Siri invokes a single signed Shortcut, such as "Мой дом".
2. The Shortcut uses native Apple Dictate Text (or accepts Shortcut Input) and receives a user's utterance on device.
3. A deterministic allowlisted intent parser resolves target device, action, percent/range, read-status, scenario, or clarification using a catalogue from the user's official Yandex API; no free-form API calls and no hallucinated IDs.
4. The Shortcut sends an authorized request only through official Yandex Smart Home API using OAuth permissions. For reads use GET, for actions use supported capabilities and validate device ranges and availability. Display/speak result only after checking the HTTP/API response.
5. Actions on gates, locks, heating or safety-relevant infrastructure require explicit confirmation before executing.
6. If a request is beyond publicly documented API (e.g. open dialogue with Alice or answering arbitrary information queries), answer "not supported" instead of cookies/private endpoints or falsified result.
7. An optional narrow proxy may be evaluated *only if it is needed* for secure parsing or storing catalogs; the Shortcut remains the sole user-facing entry point. Minimize trust and costs.

## Acceptance criteria — pending
- Generate and cryptographically sign an Apple AEA1 .shortcut, download and import on iPhone.
- Siri on Apple Watch starts that same Shortcut, dictates one of at least 20 test utterances.
- State retrieval, on/off, percent range and scenario activation tested against actual devices and API capabilities, with read/write scopes; verify exact responses.
- At least 10 negative tests: ambiguities, missing target, unsupported action, invalid range, expired token, network failure, misrecognition, dangerous actions, replay, no-response.
- No production regression, no credentials exposed in signing uploads, logs, URLs, embedded files or repository.
- All unverified claims marked NOT_TESTED; do not call a prototype complete.

## Current checkpoint
PASS: Git snapshot; main page code isolation; abandoned Voice Lab removed.
PASS: existing `studio/app.js` already generates unsigned XML plist and `studio/signer.js` sends to restricted Supabase signer and checks signed AEA1.
NOT_TESTED: universal native Shortcut actions, signing, iPhone/Watch and real Yandex execution.
