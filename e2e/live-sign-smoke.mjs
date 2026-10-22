import {chromium} from "playwright";
import assert from "node:assert/strict";

// Live signing uses demo fixtures only. No real Yandex credentials or IDs.
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const target of [
  {id:"home",url:"https://mapkepp.github.io/tools/"},
  {id:"studio",url:"https://mapkepp.github.io/tools/studio/"}
 ]){
   const page=await browser.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(String(e).slice(0,160)));
   await page.goto(target.url+"?sign-smoke=20261023",{waitUntil:"domcontentloaded",timeout:45000});
   await page.locator("#demoButton").click();
   await page.locator("button.item[data-id='l1']").click();
   await page.locator("#signConsent").check();
   await page.locator("#downloadSign").click();
   try{await page.locator("#signedReady").waitFor({state:"visible",timeout:45000});}
   catch{
     const safe=(await page.locator("#status").textContent()||"").slice(0,160);
     throw Error("Live signing "+target.id+" failed; UI status: "+safe);
   }
   const log=await page.locator("#signDiagnosticLog").textContent();
   assert.match(log,new RegExp(target.id+".*generate_ok"));
   assert.match(log,/aea1_ok/);
   assert.match(log,/ready/);
   assert.match(await page.locator("#signedDownload").getAttribute("href"),/^blob:/);
   const head=await page.evaluate(async()=>{
     const response=await fetch(document.getElementById("signedDownload").href);
     return String.fromCharCode(...new Uint8Array((await response.arrayBuffer()).slice(0,4)));
   });
   assert.equal(head,"AEA1");
   assert.equal(errors.length,0);
   await page.waitForTimeout(1200);
   await page.close();
   console.log("PASS: actual Shortcuty AEA1 signing through production "+target.id+" UI, with safe step log and a downloadable file");
 }
}finally{await browser.close();}
