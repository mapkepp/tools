import {chromium} from "playwright";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 const mockJS=await readFile("studio/metrics.js","utf8");
 const rows={home:{visits:0,uses:0},studio:{visits:0,uses:0}};
 const events=[];
 const all=()=>({pages:{home:{...rows.home},studio:{...rows.studio}},
   total:{visits:rows.home.visits+rows.studio.visits,uses:rows.home.uses+rows.studio.uses}});
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
     assert.ok(["visit","use"].includes(body.event));
     assert.ok(!JSON.stringify(body).includes("SECRET_OAUTH_TOKEN"));
     assert.ok(!JSON.stringify(body).includes("PERSONAL_DEVICE_NAME"));
     events.push(body);
     rows[body.page][body.event==="visit"?"visits":"uses"]++;
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
   await page.locator("#demoButton").click();
   await page.locator("button.item[data-id='l1']").click();
   await page.locator("#oauthToken").evaluate(el=>{el.value="SECRET_OAUTH_TOKEN";});
   await page.locator("#makeShare").click();
   await page.waitForFunction(name=>document.getElementById("siteMetricsStatus").textContent.includes(name+": ")&&
      document.getElementById("siteMetricsStatus").textContent.includes("действий"),id==="home"?"Главная":"Студия");
   await page.waitForTimeout(150);
   assert.equal(events.filter(x=>x.page===id&&x.event==="use").length,1,"one action per click");
   const visits=events.filter(x=>x.page===id&&x.event==="visit").length;
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForTimeout(350);
   assert.equal(events.filter(x=>x.page===id&&x.event==="visit").length,visits,"no double-count on tab reload");
   console.log("PASS: "+id+" author credit, donation, page count, use count, session dedupe and secret-free calls");
 }
 assert.deepEqual(rows,{home:{visits:1,uses:1},studio:{visits:1,uses:1}});
 assert.ok(!JSON.stringify(events).includes("PERSONAL_DEVICE_NAME"));
 console.log("PASS: only aggregate enums sent; no credentials, names or persistent visitor IDs");
}finally{await browser.close();}
