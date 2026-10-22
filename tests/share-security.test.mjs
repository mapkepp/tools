import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const ids=["studio/app.js","studio/share.js","studio/vendor/qrcode.min.js"];

test("all deployed browser scripts parse as standalone JavaScript", async()=>{
  for(const file of ids)assert.doesNotThrow(()=>new vm.Script(await read(file),{filename:file}));
});

test("the recipient's share-link configuration does not serialize an OAuth token",async()=>{
  const script=await read("studio/app.js");
  const share=await read("studio/share.js");
  assert.match(script,/getShareData\(\)/);
  assert.match(script,/return \{v:1,k:selected\.kind,id:selected\.obj\.id,n:selected\.obj\.name/);
  assert.doesNotMatch(script.slice(script.indexOf("getShareData(){"),script.indexOf("restoreShare(o){")),/oauthToken|access_token/);
  assert.match(share,/target\.hash="config="\+enc\(model\)/);
  assert.match(share,/location\.origin\+location\.pathname/);
  assert.match(share,/share\.pending/);
});

test("QR generator is locally vendored, and the MIT notice is retained",async()=>{
  const script=await read("studio/share.js");
  const vendor=await read("studio/vendor/qrcode.min.js");
  const license=await read("studio/vendor/LICENSE-qrcodejs");
  assert.match(script,/script\.src="\.\/vendor\/qrcode\.min\.js"/);
  assert.match(vendor,/QRCode/);
  assert.match(license,/Copyright \(c\) 2012 davidshimjs/);
  assert.match(license,/MIT License/);
  assert.doesNotMatch(script,/api\.qrserver|quickchart\.io|cdn\.jsdelivr/);
});

test("dangerous embedded-token signing needs separate affirmative consent",async()=>{
  const js=await read("studio/share.js");
  const index=await read("studio/index.html");
  assert.match(js,/dangerConsent1/);
  assert.match(js,/dangerConsent2/);
  assert.match(js,/ПЕРЕДАТЬ ДОСТУП/);
  assert.match(js,/window\.confirm/);
  assert.match(js,/signWithEmbeddedToken/);
  assert.match(index,/токен будет передан внешнему сервису Shortcuty/);
});

test("generated shortcuts help recipients obtain a token on their own iPhone",async()=>{
  const script=await read("studio/app.js");
  assert.match(script,/https:\/\/mapkepp\.github\.io\/tools\/studio\//);
  assert.match(script,/WFWorkflowImportQuestions:embeddedToken\?\[\]/);
  assert.match(script,/YANDEX_OAUTH_TOKEN/);
});

test("profile endpoint has no persistent token storage and limits account fields",async()=>{
  const profile=await read("supabase/functions/yandex-profile/index.ts");
  assert.match(profile,/https:\/\/login\.yandex\.ru\/info/);
  assert.match(profile,/Authorization:"OAuth "\+token/);
  assert.match(profile,/access-control-allow-origin/);
  assert.doesNotMatch(profile,/console\.log\(|localStorage|upsert\(/);
});
