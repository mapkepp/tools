import {chromium} from "playwright";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 const mockJS=await readFile("studio/metrics.js","utf8");
 const rows={home:{visits:0,uses:0,uniqueBrowsers:0},studio:{visits:0,uses:0,uniqueBrowsers:0}};
 let siteUnique=0;
 const events=[];
 const all=()=>({pages:{home:{...rows.home},studio:{...rows.studio}},
   total:{visits:rows.home.visits+rows.studio.visits,uses:rows.home.uses+rows.studio.uses,uniqueBrowsers:siteUnique}});
 await page.route("**/studio/metrics.js*",async route=>
   route.fulfill({status:200,contentType:"text/javascript",body:mockJS}));
 await page.route("**/studio/frozen-2026-10-23/metrics.js*",async route=>
   route.fulfill({status:200,contentType:"text/javascript",body:mockJS}));
 await page.route("**/functions/v1/site-metrics",async route=>{
   const request=route.request(),url=request.url();
   assert.equal(new URL(url).search,"");
   assert.equal(request.headers().authorization,undefined);
   assert.equal(request.headers().cookie,undefined);
   const headers={"access-control-allow-origin":"https://mapkepp.github.io","content-type":"application/json"};
   if(request.method()==="OPTIONS")return route.fulfill({status:204,headers});
   if(request.method()==="POST"){
     assert.match(request.headers()["content-type"],/^text\/plain/i);
     const body=JSON.parse(request.postData()||"");
     assert.deepEqual(Object.keys(body).sort(),["event","page"]);
     assert.ok(["home","studio"].includes(body.page));
     assert.ok(["visit","use","unique_first","unique_page"].includes(body.event));
     assert.ok(!JSON.stringify(body).includes("SECRET_OAUTH_TOKEN"));
     assert.ok(!JSON.stringify(body).includes("PERSONAL_DEVICE_NAME"));
     events.push(body);
     if(body.event==="visit")rows[body.page].visits++;
     if(body.event==="use")rows[body.page].uses++;
     if(body.event==="unique_first"){rows[body.page].uniqueBrowsers++;siteUnique++;}
     if(body.event==="unique_page")rows[body.page].uniqueBrowsers++;
   }
   return route.fulfill({status:200,headers,body:JSON.stringify(all())});
 });
 for(const [id,url] of [["home","https://mapkepp.github.io/tools/"],
                         ["studio","https://mapkepp.github.io/tools/studio/"]]){
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
   await page.locator("#siteMetricsStatus").waitFor({state:"visible"});
   await page.waitForFunction(name=>document.getElementById("siteMetricsStatus").textContent.includes(name+": "),id==="home"?"Главная":"Студия");
   assert.equal(await page.locator(".header-actions .pill").textContent(),"Бесплатно · Без регистрации by Mapkepp");
   assert.equal(await page.locator(".header-donate").getAttribute("href"),"#donate");
   assert.equal(await page.locator("#donate").count(),1);
   assert.ok(events.some(x=>x.page===id&&x.event==="visit"));
   await page.waitForFunction(()=>document.getElementById("siteMetricsStatus").textContent.includes("уникальных браузеров"));
   assert.ok(events.some(x=>x.page===id&&x.event===(id==="home"?"unique_first":"unique_page")),
     "Each page first view must contribute one local-only unique event");
   await page.locator("#demoButton").click();
   await page.locator("button.item[data-id='l1']").click();
   await page.locator("#oauthToken").evaluate(el=>{el.value="SECRET_OAUTH_TOKEN";});
   await page.locator("#makeShare").click();
   const qrHash=await page.evaluate(()=>location.hash);
   await page.locator(".header-donate").click();
   assert.equal(await page.evaluate(()=>location.hash),qrHash,"Donation scroll must preserve QR and OAuth return hash");
   await page.waitForFunction(name=>document.getElementById("siteMetricsStatus").textContent.includes(name+": ")&&
      document.getElementById("siteMetricsStatus").textContent.includes("действий"),id==="home"?"Главная":"Студия");
   await page.waitForTimeout(150);
   assert.equal(events.filter(x=>x.page===id&&x.event==="use").length,1,"one action per click");
   const visits=events.filter(x=>x.page===id&&x.event==="visit").length;
   const uniques=events.filter(x=>x.page===id&&x.event.startsWith("unique_")).length;
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForTimeout(350);
   assert.equal(events.filter(x=>x.page===id&&x.event==="visit").length,visits,"no double-count on tab reload");
   assert.equal(events.filter(x=>x.page===id&&x.event.startsWith("unique_")).length,uniques,
     "Local browser marker must prevent duplicate unique count after reload");
   console.log("PASS: "+id+" author credit, donation, page count, use count, session dedupe and secret-free calls");
 }
 assert.deepEqual(rows,{home:{visits:1,uses:1,uniqueBrowsers:1},studio:{visits:1,uses:1,uniqueBrowsers:1}});
 assert.equal(siteUnique,1,"One browser switching between home and studio is one site visitor");
 assert.ok(!JSON.stringify(events).includes("PERSONAL_DEVICE_NAME"));
 console.log("PASS: one unique browser across home and studio, no transmitted IDs, names, or OAuth");
}finally{await browser.close();}
