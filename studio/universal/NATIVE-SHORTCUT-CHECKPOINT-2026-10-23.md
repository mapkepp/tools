# Native Universal Siri Shortcut — engineering checkpoint (23.10.2026)

**Scope:** one generated **Apple Shortcut** started by Siri on iPhone/Apple Watch. No Voice Lab, no browser speech recognition, no proprietary/undocumented Alice endpoint.

## Baseline / backup protection
- Stable public homepage: https://mapkepp.github.io/tools/ — **do not edit** `index.html`, frozen scripts or shared signing handler.
- Restore point: `backup/prod-locked-2026-10-23-1337` at commit `c7b8e61fb1580b7c6df8010e56da192ca9f6b70e`.
- Research/development branch: `experiment/voice-universal-2026-10-23`. Do not merge experimental changes to the homepage.

## Tested offline prototype
The local Python compiler `build_universal.py` generated `Mapkepp-My-Home-Native-UNSIGNED.shortcut` with:
- 122 Apple native workflow actions (including 54 conditional actions and 15 guarded API request branches);
- `Dictate Text` with Russian locale, device aliases, conflict/ambiguity guards;
- GET `https://api.iot.yandex.net/v1.0/devices/{id}` for status;
- POST `https://api.iot.yandex.net/v1.0/devices/actions` for on/off and brightness;
- `Ask for Input: Number` for brightness, with min/max guards;
- import-time OAuth token placeholder, never embedded into the unsigned file;
- exclusion of gates/doors/locks/heaters from the initial automation template;
- binary plist size 20,951 bytes (XML equivalent 157,847 bytes; previous Studio signing size limit 100,000 bytes);
- six offline unit tests PASS and a successful plist binary round trip.

**Honest limits:** no physical iPhone, Apple Watch, live Yandex OAuth, Apple AEA1 signature or imported shortcut tested. Native conditional behavior and dynamic structured JSON values **may differ on-device**; do not claim functioning Apple Watch voice control. Test with synthetic IDs only until an iOS import is independently verified.

**Artifacts for this session:** generated native `.shortcut` and ZIP containing compiler, tests, synthetic demo inventory and compiled binary. The ZIP is attached in the producing conversation, NOT deployed as a GitHub release. Promote the compiler into the repo only after review.

## Safety: acceptance gates
1. Check exact workflow action identifiers and conditional codes against Apple-built sample (`WFCondition=99` contains, `4` equals, numeric `0` less-than, `2` greater-than).
2. Ensure every control-flow `GroupingIdentifier` closes and UUID is unique; every reference resolves.
3. All outgoing network actions must have only Yandex Smart Home public `api.iot.yandex.net` endpoints.
4. No bearer token or live device IDs in signing uploads, logs, QR or public Git.
5. Validate device capabilities, ranges, aliases and opt-in for potentially dangerous devices.
6. Verify iPhone import, dialog questions and Apple Watch dictation, including negative paths.
7. Check unaffected homepage blob and run browser regression before any deployment.

## Additional functional work still required
- Interpret API response `status`, per-device result/error and capabilities into conversational Russian.
- Support percentages directly from spoken phrases without asking again.
- Generate personalized devices from *user-approved local inventory* with no token in artifact sent for signing.
- Add first-party Apple signing route for compiled **binary** plist, isolated from production signing.
- Obtain a real signed AEA1 artifact, then end-to-end test.
- General Alice Q&A is **not** supported by this official IoT API; do not disguise unsupported functions.

Sources:
- https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/platform-protocol
- https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/platform-device-info
- https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/platform-capabilities
- https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/CONTROL_FLOW.md
