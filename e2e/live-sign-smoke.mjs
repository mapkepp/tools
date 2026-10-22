import {chromium} from "playwright";
import assert from "node:assert/strict";
// Explicit live integration test with synthetic device only. No Yandex credentials.
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on("pageerror",err=>errors.push(String(err).slice(0,180)));
 const base="https://mapkepp.github.io/tools/studio/";
 await page.goto(base+"?sign-smoke=1",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#demoButton").click();
 await page.locator("button.item[data-id='l1']").click();
 await page.locator("#signConsent").check();
 await page.locator("#downloadSign").click();
 const success=page.locator("#signedReady");
 const fail=page.locator("#status.warning");
 await Promise.race([
  success.waitFor({state:"visible",timeout:55000}).then(()=>true),
  fail.waitFor({state:"visible",timeout:55000}).then(()=>false)
 ]).then(ok=>{if(!ok)throw Error("Signing failed: "+String(fail.textContent()).slice(0,220));});
 assert.match(await page.locator("#signedDownload").getAttribute("href"),/^blob:/);
 const head=await page.evaluate(async()=>{
  const response=await fetch(document.getElementById("signedDownload").href);
  return String.fromCharCode(...new Uint8Array((await response.arrayBuffer()).slice(0,4)));
 });
 assert.equal(head,"AEA1");
 assert.equal(errors.length,0);
 console.log("PASS: actual Shortcuty signing via live Supabase Edge endpoint returns Apple AEA1 for synthetic fixture");
}finally{await browser.close();}
