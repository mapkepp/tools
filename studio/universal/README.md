# Universal Siri Shortcut — experiment, not deployed

**Only target product:** a signed Apple Shortcut (`.shortcut` / Apple AEA1). This folder contains a deterministic intent resolver used to prototype control-flow compilation, NOT an alternative browser Voice Lab and NOT a runtime service.

Current functionality: parses a subset of Russian phrases, checks device capability, distinguishes read requests and write requests, and requires confirmation for sensitive devices. No OAuth token handling, no network transport, no Apple Shortcut signing, no live actions yet.

Run `node studio/universal/intent.test.js`. Do not ship this resolver as a generic free-dialogue feature: it must be compiled into the native Apple Shortcut flow and validated on iOS first.

Production main page and frozen assets must not be edited. Separate main production backup: `backup/prod-locked-2026-10-23-1337`.
