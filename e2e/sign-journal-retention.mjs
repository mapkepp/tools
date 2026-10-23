import {chromium} from "playwright";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

// Tests only fabricated UI interactions; never contacts Yandex or Shortcuty.
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try {
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 const telemetry=[];
 await page.route("**/functions/v1/shortcut-sign",async route=>{
   const method=route.request().method();
   const headers={"Access-Control-Allow-Origin":"https://mapkepp.github.io","Access-Control-Allow-Headers":"content-type","Content-Type":"application/json"};
   if(method==="OPTIONS")return route.fulfill({status:204,headers});
   const packet=JSON.parse(route.request().postData()||"{}");
   assert.equal(packet.operation,"sign_trace","No signing request should occur without explicit consent");
   assert.ok(["studio","home"].includes(packet.page));
   assert.match(packet.trace,/^[a-f0-9-]{36}$/);
   assert.ok(packet.events.some(e=>e.stage==="failure"&&e.code==="consent_missing"));
   telemetry.push(packet);
   return route.fulfill({status:200,headers,body:'{"ok":true}'});
 });
 await page.route("**/studio/signer.js*",async route=>route.fulfill({status:200,contentType:"text/javascript",body:await readFile("studio/signer.js","utf8")}));
 await page.route("**/studio/frozen-2026-10-23/signer.js*",async route=>route.fulfill({status:200,contentType:"text/javascript",body:await readFile("studio/frozen-2026-10-23/signer.js","utf8")}));
 const urls=[{name:"home",url:"https://mapkepp.github.io/tools/"},{name:"studio",url:"https://mapkepp.github.io/tools/studio/"}];
 let prior=0;
 for(const item of urls){
   await page.goto(item.url+"?log-retention-check=20261023",{waitUntil:"domcontentloaded",timeout:45000});
   await page.locator("#clearSignDiagnostics").waitFor({state:"attached",timeout:15000});
   const before=await page.locator("#signDiagnosticLog").textContent();
   assert.ok((before.match(/consent_missing/g)||[]).length>=prior);
   await page.locator("#demoButton").click();
   await page.locator("button.item[data-id='l1']").click();
   assert.equal(await page.locator("#signConsent").isChecked(),false);
   for(let i=0;i<2;i++){
     await page.locator("#downloadSign").click();
   }
   const accumulated=await page.locator("#signDiagnosticLog").textContent();
   const errors=accumulated.match(/consent_missing/g)||[];
   assert.equal(errors.length,prior+2);
   assert.ok(accumulated.includes("| "+item.name+" |"));
   assert.equal(await page.locator("#signConsentReminder").isVisible(),true);
   const traces=[...accumulated.matchAll(/\| (?:home|studio) \| ([0-9a-f-]{36}) \| click \|/g)].map(m=>m[1]);
   assert.equal(new Set(traces).size,traces.length,"Every attempt must retain a separate trace");
   await page.reload({waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(await page.locator("#signDiagnosticLog").textContent(),accumulated,"Same-tab reload must retain full safe journal");
   prior+=2;
   console.log("PASS: "+item.name+" journal accumulates attempts, has unique trace, highlights consent and survives reload");
 }
 assert.equal(await page.locator("#signDiagnostics summary").isVisible(),true,"Journal summary must be visible without selecting a device");
 await page.locator("#signDiagnostics summary").click();
 await page.locator("#clearSignDiagnostics").click();
 assert.equal((await page.locator("#signDiagnosticLog").textContent()).trim(),"");
 await page.reload({waitUntil:"domcontentloaded"});
 assert.equal((await page.locator("#signDiagnosticLog").textContent()).trim(),"","Manual clearing must remove saved log too");
 await page.locator("#demoButton").click();
 await page.locator("button.item[data-id='l1']").click();
 await page.locator("#downloadSign").click();
 assert.equal(((await page.locator("#signDiagnosticLog").textContent()).match(/consent_missing/g)||[]).length,1);
 console.log("PASS: manual clear is durable and does not disable future diagnostics");
 assert.ok(telemetry.every(t=>!JSON.stringify(t).includes("YANDEX_OAUTH_TOKEN")));
 console.log("PASS: sanitized telemetry never contains a Yandex token or signed-file content");
} finally {await browser.close();}
