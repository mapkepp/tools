# Mapkepp Universal Siri Shortcut v3 — controlled engineering checkpoint
Date: 2026-10-23. Branch: `experiment/voice-universal-2026-10-23`. Production homepage remains frozen.

## Production protection (never cross this boundary automatically)
- Production: https://mapkepp.github.io/tools/ — `index.html` and `studio/frozen-2026-10-23/**` must not be modified.
- Verified rollback ref: `backup/prod-locked-2026-10-23-1337` at `c7b8e61fb1580b7c6df8010e56da192ca9f6b70e`.
- Do not deploy or modify `studio/index.html` or the shared signing handler from this experiment. Only an explicitly verified native, signed `.shortcut` may be promoted after iOS E2E.

## What was really produced
- Offline compiler `build_universal.py` v3, native binary-plist Apple Shortcut, not a Voice Lab, web app or fake Siri chat.
- Test inventory: demo bedroom lamp (on/off + 1–100% brightness), demo kitchen lamp (on/off), demo scenario (launch). ALL IDs are synthetic.
- Native flow: `dictatetext` -> alias/ambiguity/intent conditions -> native `text.match` numeric percentage extraction -> bounds guards -> native Yandex API GET/POST -> `detect.dictionary` + `getvalueforkey` response inspection -> output.
- Device actions: check `devices.1.capabilities.1.state.action_result.status == DONE`, not just the top-level `status: ok`. Scenario reports are explicitly not claimed as device-state confirmation.
- If a spoken number is absent, native Number prompt provides fallback. Spoken number words remain unsupported / require fallback.
- Safety critical device names excluded. No token or third-party URLs inside the unsigned file; importing user must supply own Yandex OAuth token later.

## Evidence, hashes, tests
- Binary `Mapkepp-My-Home-Native-v3-UNSIGNED.shortcut`: 65,008 bytes, SHA256 `d1126dbc86a4cd57a45652ab86ccb6657752bd98102cdf610e6c1961e78ed4ed`.
- Full local source/test/demo/binary ZIP: `mapkepp-apple-shortcut-v3-source.zip`: SHA256 `9bcc7a6710b27c129ec4fbdf74b6062deceef29cb0a15aa38a5c19b899da0dfb`. Both artifacts are attached in their ChatGPT conversation, **not yet uploaded to GitHub**. Do not fabricate a repo artifact path.
- Native actions: 554; 23 API request branches; destinations limited to official `api.iot.yandex.net` GET device state, POST device actions, POST scenario actions.
- Python tests: 12/12 PASS for v3 compiler + five additional checks; 6/6 PASS for separately stored local inventory adapter = 18/18 total.
- Compiler fails closed if generated binary exceeds 95,000 bytes, avoiding silent oversize release.
- Device adapter in this branch: `studio/universal/inventory_adapter.py`, `studio/universal/test_inventory_adapter.py`: explicit ID selection, no implicit whole-house export, danger-name exclusion, local-only output, no access tokens.

## Honest NOT_TESTED / blockers
1. AEA1 signing: NOT_TESTED. This execution environment cannot resolve `sign.shortcuty.app`; DO NOT claim a signed file.
2. Native action serialization: plist round-trip PASS, but real iOS/Apple Watch import/runtime NOT_TESTED. In particular `WFInput` variable bindings and regex value conversion require on-device validation.
3. Live Yandex account/token: NOT_TESTED; do not embed real OAuth tokens in unsigned signing upload or logs.
4. Voice ASR accuracy for multi-word Russian and numeric words: NOT_TESTED; no claim of free dialogue with Alice.
5. Scalability: 2 full-featured lights approach the current 95kB guard; 3+ similar devices exceed it. The shortcut is **not yet universal for a large home**. Architectural optimization mandatory before mass release.

## Next gated work
- Transfer actual compiler source into GitHub experiment branch as plain UTF-8 files (archive is in conversation, not GitHub).
- Confirm working action serialization and action outputs from a real Apple Shortcuts example (iOS/Watch).
- Implement efficient scalable branching, full device-state narration, and natural Russian number words.
- Sign synthetic-only shortcut using a reviewed service; verify resulting `AEA1` header and digest, import and E2E only then.
- Run homepage snapshot comparison and complete regressions before any promotion.

## Authoritative references
- https://yandex.ru/dev/dialogs/smart-home/doc/en/concepts/platform-protocol
- https://yandex.ru/dev/dialogs/smart-home/doc/en/concepts/platform-capabilities
- https://yandex.ru/dev/dialogs/smart-home/doc/en/concepts/platform-device-info
- https://yandex.ru/dev/dialogs/smart-home/doc/en/concepts/platform-scenario
- https://docs.scpl.dev/actions/matchtext
- https://docs.scpl.dev/actions/getdictionaryvalue
