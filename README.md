# Mapkepp Tools — Smart Home Shortcut Studio

**Primary repository:** https://github.com/mapkepp/tools/  
**Planned Pages URL (currently not live):** https://mapkepp.github.io/tools/  
**Temporary working demo:** https://mapkepp.github.io/loto-generator/public-tools-hub/

**Status: MVP (22 October 2026).** Free, independent and unofficial community project.

## Features
- Device on/off and brightness; group on/off and brightness; scenario launch.
- Live preview of official Yandex Smart Home HTTP request and copy request metadata.
- Offline-in-browser XML plist generator for Apple Shortcuts. No dependency on browser JavaScript libraries.
- Optional **user-approved** cross-origin HTML form submission of the **unsigned** shortcut to the documented [Shortcuty Signing API](https://github.com/Shortcuty/Signing-Server-API-Documentation). Apple signatures are required for third-party import.
- Import-time prompt for user's Yandex OAuth token; the token never needs to be entered on the website. The unsigned Shortcut may contain entered device/group/scenario identifiers, which are sent to Shortcuty when signing.
- Experimental VPN disconnect/reconnect with explicit warning; users select their local VPN profile after importing. A failed action may leave VPN disconnected.

## Privacy and rights
No sign-up, analytics, cookies, user accounts, token fields or device-control API requests on this static web page. Everything except optional signing takes place client-side. No data is stored by this application. GitHub Pages and the third-party signer have their own logging and policies.

Use only devices and accounts you are authorized to control. No affiliation with Apple or Yandex; product names are used for compatibility descriptions and do not imply endorsement.

API docs: https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/platform-protocol

## Donations
All functionality is free and identical for everyone. Author support is **optional and confers no feature access, priority, or other benefit**. Primary YooMoney fundraiser: https://yoomoney.ru/fundraise/1L2T11QBAHF.261022. The public page contains a direct link and a separately user-activated iframe to `https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1L2T11QBAHF.261022&`. The embedded frame is **not loaded before a user clicks**. Payments take place with YooMoney and not on this website. Tax/payment processing treatment depends on the facts and local law; labelling a transaction a donation does not determine its tax status. Do not use a different bill number from snippets posted earlier.

## GitHub Pages

Target: https://mapkepp.github.io/tools/

The repository includes `.github/workflows/pages.yml`, which runs on pushes to `main` and on manual dispatch. Its first run failed at `actions/configure-pages` because GitHub Pages has **not been enabled**. GitHub's automatic `GITHUB_TOKEN` cannot perform initial Pages site enablement; the connected GitHub app cannot modify repository Pages settings.

**One-time repository setting:** open https://github.com/mapkepp/tools/settings/pages → Build and deployment → **Source: GitHub Actions**. After this is enabled, rerun the failed workflow at https://github.com/mapkepp/tools/actions/workflows/pages.yml (or push another commit). No paid hosting is required.

No computer or paid hosting is required.

## Current verification
- Primary Pages HTTPS site: **FAIL / HTTP 404** until initial Pages enablement. Temporary old demo URL: PASS.
- Six request/configuration variants: PASS (browser regression checks).
- XML plist generation, true/false, integer number, ID and OAuth-token absence: PASS.
- Apple AEA1 signer integration tested on scenario and VPN/non-VPN variants: PASS using **synthetic** IDs only.
- Real iPhone iOS 26.6.2 import, VPN reconnection, device control, Safari cross-origin form downloads: **NOT_TESTED**.
- Primary `mapkepp/tools` repository: **PASS**; deployment workflow: **PASS created / Pages activation must be verified**; YooMoney donation link and opt-in widget configured; actual payment flow **NOT_TESTED**.
