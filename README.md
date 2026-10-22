# Mapkepp Tools — Smart Home Shortcut Studio

[💜 Добровольно поддержать автора через ЮMoney](https://yoomoney.ru/fundraise/1L2T11QBAHF.261022)

> Все функции проекта бесплатны и доступны без поддержки автора. Переводы полностью добровольные; дополнительных возможностей или преимуществ они не дают.

**Primary repository:** https://github.com/mapkepp/tools/  
**Live website:** https://mapkepp.github.io/tools/  
**Historical first demo:** https://mapkepp.github.io/loto-generator/public-tools-hub/ (not the primary site)

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
- Primary `mapkepp/tools` repository: **PASS**; deployment workflow: **PASS created / Pages activation must be verified**; YooMoney donation link and opt-in widget configured; actual payment flow **NOT_TESTED**.
