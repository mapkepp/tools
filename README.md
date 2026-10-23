# Mapkepp Tools — Smart Home Shortcut Studio

**Пользователям iPhone и Siri:** [создать Apple Команду для Яндекс Умного дома](https://mapkepp.github.io/tools/) · [объяснение и инструкция](https://mapkepp.github.io/tools/siri-yandex.html).

**Полевой опыт автора (23.10.2026):** голосом через Siri на Apple Watch работают ранее настроенные команды включения уличного света и открытия/закрытия ворот. Подтверждение — сообщение автора проекта, не независимый E2E-тест актуальной генерации файлов. [Запись наблюдения](docs/APPLE-WATCH-FIELD-REPORT-2026-10-23-RU.md).

**Поиск и продвижение:** [Sitemap](https://mapkepp.github.io/tools/sitemap.xml) · [готовый черновик для Дзена](docs/DZEN-ARTICLE-RU.md) · [реестр площадок](docs/MARKETING-OUTREACH-2026-10-23-RU.md).

**Авторство и условия:** собственный код — [MIT License](LICENSE), уведомление об авторстве содержит адрес официального сайта и страницу добровольной поддержки. При распространении существенной части собственного кода сохраняются copyright/permission notices согласно MIT. Просим размещать ссылки также в интерфейсах производных проектов, но это не дополнительное лицензионное ограничение. Подробности — [NOTICE.md](NOTICE.md). Третьесторонние лицензии остаются неизменными.

[💜 Добровольно поддержать автора через ЮMoney](https://yoomoney.ru/fundraise/1L2T11QBAHF.261022)

> Донаты — это добровольные пожертвования. Они не открывают никакого дополнительного функционала и не дают преимуществ. Весь функционал доступен сразу всем полностью бесплатно, независимо от пожертвований. [Поддержать через Т-Банк](https://t.tb.ru/pm_short/7Ixu10XDRWa).

## Approved homepage changes and offline device lists

- The main homepage now ALSO has local device list download (portable, token-free JSON), user-approved IndexedDB save, manual restore, auto-restore on a normal visit, and deletion. It uses independent frozen-script copies, with no need for recurring Yandex requests. Test coverage includes export/import and QR precedence.

- Homepage is the preserved Studio UI. The user explicitly approved a prominent link to the experimental /studio/ and detailed signing logs in a later request. Homepage HTML is now frozen at blob SHA `00cd60042a776408fb00461be1667744d487a005`; frozen assets live under `studio/frozen-2026-10-23/`, including a dedicated signer.
- Signing uses the same safe handler for home and studio. Both produce `AEA1` via Shortcuty on synthetic fixtures. Browser and server telemetry mark every stage with `page=home|studio` and a per-attempt random trace UUID; no token or device names are logged.
- Experimental Studio can export a token-free inventory JSON file or save it to browser IndexedDB on user action, restore it automatically on ordinary reload (unless opening a QR/shared configuration or completing OAuth), and delete the local copy. iOS native Safari behavior and real-device end-to-end remain NOT_TESTED.

## Current release — 23 October 2026

- **Immutable homepage snapshot:** [main page](https://mapkepp.github.io/tools/) is a frozen Studio UI (Git blob `00cd60042a776408fb00461be1667744d487a005`), with isolated scripts in `studio/frozen-2026-10-23/`. Do not modify `index.html` or frozen assets without a new explicit user instruction.
- **Active development:** [Studio](https://mapkepp.github.io/tools/studio/). Signed .shortcut downloads now use the restricted `shortcut-sign` Supabase function and Shortcuty. Live provider signing has passed a synthetic-data test; real Safari/iPhone import is NOT_TESTED.
- Ready-to-use QR configuration is preserved across Yandex OAuth callback so users can copy their token without losing the prepared command.
- Concurrency is stateless and account-isolated; per-user independent requests were tested with synthetic data. Live load/quota capacity is NOT_TESTED; local iPhone discovery + manual JSON import is optional.
- See [canonical release checkpoint](docs/STUDIO-RELEASE-2026-10-23-RU.md) and [backed-up source branch](https://github.com/mapkepp/tools/tree/backup/studio-working-2026-10-23).

**Primary repository:** https://github.com/mapkepp/tools/  
**Live website:** https://mapkepp.github.io/tools/  
**Historical first demo:** https://mapkepp.github.io/loto-generator/public-tools-hub/ (not the primary site)

**Status: MVP (22 October 2026).** Free, independent and unofficial community project.

## Features
- Device on/off and brightness; group on/off and brightness; scenario launch.
- Live preview of official Yandex Smart Home HTTP request and copy request metadata.
- Offline-in-browser XML plist generator for Apple Shortcuts. No dependency on browser JavaScript libraries.
- Optional **user-approved** cross-origin HTML form submission of the **unsigned** shortcut to the documented [Shortcuty Signing API](https://github.com/Shortcuty/Signing-Server-API-Documentation). Apple signatures are required for third-party import.
- The device studio receives an OAuth token through Yandex ID or optional manual input. The signed iPhone Shortcut separately prompts for a token at import. The unsigned Shortcut contains **no token** but does contain the selected object ID, which is disclosed to Shortcuty when signing.
- Experimental VPN disconnect/reconnect with explicit warning; users select their local VPN profile after importing. A failed action may leave VPN disconnected.

## Preserved, actually signed kitchen light examples

The [public main page](https://mapkepp.github.io/tools/#verifiedExamples) now presents the **original successful signed Apple AEA1 Shortcut files** from 22 October 2026, alongside local QR codes and separate copy/download links for ON and OFF:

- [Kitchen_Light_ON.shortcut](https://mapkepp.github.io/tools/examples/Kitchen_Light_ON.shortcut), SHA-256 `c91fe62140d74e70983d34381cf8b79348a1852b3fa585aaf0c213ed25b65355`
- [Kitchen_Light_OFF.shortcut](https://mapkepp.github.io/tools/examples/Kitchen_Light_OFF.shortcut), SHA-256 `13988b58a64d296b45bc84fa4a634fdf20ae26c96a030eee525ce22462d0a5f1`

The source artifacts are retained in the older public `mapkepp/loto-generator` repository at pinned revision `efce885304d1b8b83d4f217a8440c8a80be59295`. GitHub Pages packages **those exact signed bytes** and rejects a release if SHA-256 or Apple `AEA1` format differs. A separate [public download workflow](https://github.com/mapkepp/tools/actions/workflows/verify-example-shortcuts.yml) verifies the artifacts after deployment, and [Chromium regression tests](https://github.com/mapkepp/tools/actions/workflows/browser-regression.yml) check the local QR display.

**Crucial distinction:** these are verified examples of **successful generation and cryptographic signing**, not proof of physical device control. They use synthetic device identifiers; no OAuth token is embedded or published. They prompt for a token on import, but to control a real appliance the user must generate a new command with their actual device ID in the Studio.

## Share a ready-to-install iPhone Shortcut

In the [Smart Home Studio](https://mapkepp.github.io/tools/studio/), choose an action and press **«Создать ссылку»**. The generated self-contained link and locally generated QR code preserve the chosen device/action across phones and computers, **without including any OAuth token**. The recipient can open it on iPhone, authorize their Yandex account, and install a signed `.shortcut`. The installation prompt includes where to obtain and copy a token. Separate **«Скопировать мой токен»** and **account name/avatar** are shown as permissions allow.

The special **«команда со встроенным токеном»** option is **dangerous and opt-in only**: it requires two checked warnings, the typed phrase «ПЕРЕДАТЬ ДОСТУП» and a final browser confirmation. It sends the embedded token to external Shortcuty for signing and gives the recipient control over devices authorised by that token. It is never placed in share links, QR codes or the repository.

[User guide (Russian)](docs/SHARE-AND-TOKEN-RU.md) · [Services, privacy and software credits](https://mapkepp.github.io/tools/services.html).

## Local, token-free history

The Studio now includes an opt-in **«Мои сохранённые команды»** panel. Users can save up to 30 selected shortcut configurations on their own device and later restore, delete, import or export them as a JSON archive. No OAuth token, password, Yandex profile, cookie or cloud account is added to the saved configuration. Device names and internal device IDs **are** present in the local archive, so users should not publish it. The archive is not cross-device synced automatically. Clearing browser storage or private browsing may remove it.

Account status: the official personal Yandex ID button mounts when the page opens, provided browser privacy settings permit its SDK and cookies. A token is never inferred from an existing Yandex cookie; access still requires Yandex confirmation. Temporary OAuth tokens are isolated by Client ID, accepted only immediately after a state-checked callback and cleared after use. Devices now render before optional profile lookup. For real device access and Apple Shortcut import, user-side tests remain required.

## Smart Home device explorer

Live: https://mapkepp.github.io/tools/studio/

- Users may paste a Yandex OAuth token or sign in via Yandex ID; OAuth `state` is checked before an access token is accepted.
- **DEPLOYED:** a Supabase Edge Function at `https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/yandex-home` forwards a single user-approved HTTPS read-only request to `GET /v1.0/user/info` and returns devices, rooms, groups, scenarios and households. The web interface shows stages of loading.
- Users can browse houses, rooms, devices, groups and scenarios and choose only supported capabilities for generating signed iPhone commands.
- **VALIDATED LIVE:** HTTP OPTIONS with the site's Origin → 204; invalid OAuth token → Yandex 401; disallowed Origin → 403. Real Yandex-account inventory and physical device execution remain **NOT_TESTED** because no real user token was transferred for verification.
- [Russian setup/status guide](docs/YANDEX-AUTO-IMPORT-RU.md); automatic tests: [GitHub Actions](https://github.com/mapkepp/tools/actions/workflows/ci.yml).

## Privacy and rights
No registration with Mapkepp, advertising cookies, or analytics. The studio **can** receive a Yandex OAuth access token in a password field or via a state-checked OAuth callback; the token is temporarily passed through same-tab sessionStorage and deleted from that temporary store as soon as it is consumed. Users explicitly consent before a one-time HTTPS request containing the token to the owner's read-only serverless proxy. The application source, GitHub repositories, signing service, and browser localStorage do **not** store tokens. A hosting provider may have its own infrastructure logs; the proxy code does not intentionally log tokens or home data. The deployed proxy is read-only and responds with `Cache-Control: no-store`. The static page does not itself call the Yandex device-control API. External Shortcuty signing requires separate consent and excludes tokens.

Use only devices and accounts you are authorized to control. No affiliation with Apple or Yandex; product names are used for compatibility descriptions and do not imply endorsement.

API docs: https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/platform-protocol

## Donations

[💜 Добровольно поддержать автора через ЮMoney](https://yoomoney.ru/fundraise/1L2T11QBAHF.261022)
All functionality is free and identical for everyone. Author support is **optional and confers no feature access, priority, or other benefit**. Primary YooMoney fundraiser: https://yoomoney.ru/fundraise/1L2T11QBAHF.261022. The public page contains a direct link and a separately user-activated iframe to `https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1L2T11QBAHF.261022&`. The embedded frame is **not loaded before a user clicks**. Payments take place with YooMoney and not on this website. Tax/payment processing treatment depends on the facts and local law; labelling a transaction a donation does not determine its tax status. Do not use a different bill number from snippets posted earlier.

## GitHub Pages

Target: https://mapkepp.github.io/tools/

The repository publishes site changes automatically using `.github/workflows/pages.yml` whenever `index.html`, `assets/**` or the workflow itself changes on `main`. The workflow validates the Pages configuration, packages only public website files and publishes using GitHub Actions. 

**Current live website status: PASS (HTTPS 200).** Public live HTML SHA-256 matched `raw.githubusercontent.com/mapkepp/tools/main/index.html` on 22 Oct 2026: `a868822214064227cf851a211dec9a17e75882bff68acc1c922979d8db14289d`. The donation link and lazy-loaded embedded widget were verified in a live browser. There is no need for the repository owner to manually press Run workflow after each edit.
No computer or paid hosting is required.

## Current verification
- Primary Pages HTTPS site: **PASS HTTP 200**, deployed HTML content SHA-256 matches current source.
- Six request/configuration variants: PASS (browser regression checks).
- XML plist generation, true/false, integer number, ID and OAuth-token absence: PASS.
- Apple AEA1 signer integration tested on scenario and VPN/non-VPN variants: PASS using **synthetic** IDs only.
- Real iPhone iOS 26.6.2 import, VPN reconnection, device control, Safari cross-origin form downloads: **NOT_TESTED**.
- Primary `mapkepp/tools` and site: **PASS**; security regression tests: **PASS**; Supabase home backend and CORS: **PASS**; real Yandex devices, iPhone execution and real payments: **NOT_TESTED**.

## 23 October 2026: reliable signed file transport

- Both sites submit a synthetic token-free Shortcut XML to Shortcuty via Supabase; the response is authenticated by AEA1 and SHA-256. The edge server encrypts the signed result with AES-GCM, stores ciphertext in an RLS-locked table temporarily for at most 10 minutes, and returns the decryption key only in the initial short browser response. The browser downloads small ciphertext fragments (1,536 base64 characters each), retries individual fragments, decrypts locally, checks SHA-256, creates the signed .shortcut and releases the database row. Scheduled cleanup runs every five minutes.
- Every attempt carries page=home or page=studio and a random trace UUID. Client and Edge logs capture transport steps, per-fragment HTTP status, bytes and elapsed time; no OAuth token, home JSON or device identifiers are logged. Real Chrome cloud signing and handoff tested with fabricated device; real Yandex Browser/iPhone still NOT_TESTED.
- Applied Harness² evidence gates and operator canon §19.8 for Hermes; separate Hermes runtime remains NOT_TESTED.
