# Mapkepp Tools — Smart Home Shortcut Studio

Public demo: https://mapkepp.github.io/tools/

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
All functionality is free and identical for everyone. The support button is a **placeholder** until the owner configures a verified donation URL at `DONATION_LINK` in `index.html`. This site does not accept payments, process cards or promise benefits in return for gifts. Tax and payment processing treatment depends on the facts and applicable law; merely labeling a payment a donation does not make it non-taxable.

## GitHub Pages

Target: https://mapkepp.github.io/tools/

The repository includes a GitHub Actions Pages deployment workflow. GitHub Pages settings must be enabled; check https://github.com/mapkepp/tools/settings/pages . Site is publicly usable only when HTTP 200 is confirmed.

No computer or paid hosting is required.

## Current verification
- Public HTTPS page: PASS (HTTP 200).
- Six request/configuration variants: PASS (browser regression checks).
- XML plist generation, true/false, integer number, ID and OAuth-token absence: PASS.
- Apple AEA1 signer integration tested on scenario and VPN/non-VPN variants: PASS using **synthetic** IDs only.
- Real iPhone iOS 26.6.2 import, VPN reconnection, device control, Safari cross-origin form downloads: **NOT_TESTED**.
- Repository: **CREATED**; GitHub Pages and donation link require separate verification/configuration.
