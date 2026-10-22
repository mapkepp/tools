import {chromium} from "playwright";
import assert from "node:assert/strict";

const base="https://mapkepp.github.io/tools/studio/";
const id="e5942ee8886149dfadc84fa3bc89049a";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",err=>errors.push(String(err).slice(0,160)));
 await page.goto(base+"?browser-e2e=20261022",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#oauthToken").waitFor({timeout:12000});
 await page.waitForTimeout(800);
 assert.equal(await page.locator("#oauthToken").inputValue(),"","First visit must never display an old token");
 assert.equal(await page.locator("#oauthToken").getAttribute("readonly"),"","Token must resist password-manager autofill");
 assert.equal(await page.locator("#yandexAuth").count(),1);
 console.log("PASS: initial page and empty token");
 await page.locator("#demoButton").click();
 await page.locator("button.item[data-id='l1']").click();
 await page.locator("#actionSelect").selectOption("2");
 await page.locator("#actionValue").fill("42");
 await page.locator("#makeShare").click();
 const share=await page.locator("#shareUrl").inputValue();
 assert.ok(share.includes("#config="));
 assert.ok(!share.includes("oauth")&&!share.includes("token"));
 await page.locator("#showQR").click();
 await page.locator("#qrTarget img").first().waitFor({timeout:10000});
 await page.locator("#saveHistory").click();
 const history=await page.evaluate(()=>localStorage.getItem("mapkepp.studio.local.shortcuts.v1"));
 assert.ok(history?.includes("42") && !history.includes("access_token"));
 console.log("PASS: settings, share link, QR, token-free local history");
 await page.goto(share,{waitUntil:"domcontentloaded"});
 await page.locator("#shortcutName").waitFor();
 await page.waitForTimeout(200);
 assert.ok((await page.locator("#jsonPreview").innerText()).includes("42"));
 await page.reload({waitUntil:"domcontentloaded"});
 assert.ok((await page.locator("#historyList").innerText()).includes("Открыть"));
 console.log("PASS: share restoration and history after reload");
 // Simulated OAuth callback (never a real user's token).
 await page.evaluate(client=>{
   sessionStorage.setItem("mapkepp.yandex.oauth.state."+client,"fake-state-123");
   sessionStorage.setItem("mapkepp.yandex.oauth.consent."+client,"no");
 },id);
 await page.goto("https://mapkepp.github.io/tools/oauth/callback.html#access_token=synthetic-test-token-123456&state=fake-state-123",{waitUntil:"domcontentloaded"});
 await page.waitForURL("**/studio/?oauth=success",{timeout:12000});
 await page.locator("#oauthToken").waitFor();
 assert.equal(await page.locator("#oauthToken").inputValue(),"synthetic-test-token-123456");
 await page.reload({waitUntil:"domcontentloaded"});
 assert.equal(await page.locator("#oauthToken").inputValue(),"");
 console.log("PASS: matching OAuth state, one-time transfer and no stale reload");
 // Mock only the home/account endpoints. No personal data or access token is sent
 // to the actual provider during the following step.
 await page.route("**/functions/v1/yandex-home",async route=>{
   const headers={"access-control-allow-origin":"https://mapkepp.github.io","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type","content-type":"application/json"};
   if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
   return route.fulfill({status:200,headers,body:JSON.stringify({
     status:"ok",households:[{id:"h",name:"Тестовый дом"}],
     rooms:[{id:"k",name:"Кухня",household_id:"h",devices:["light"]}],
     devices:[{id:"light",name:"Свет",household_id:"h",room:"k",type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{}}]}],
     groups:[],scenarios:[{id:"scene",name:"Сценарий",is_active:true}]
   })});
 });
 await page.route("**/functions/v1/yandex-profile",async route=>{
   const headers={"access-control-allow-origin":"https://mapkepp.github.io","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type","content-type":"application/json"};
   if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
   return route.fulfill({status:403,headers,body:'{"error":"profile_not_authorized"}'});
 });
 await page.locator("#oauthToken").click(); // User interaction unlocks the autofill-safe field.
 await page.locator("#oauthToken").fill("synthetic-fake-oauth-token-123456");
 await page.locator("#proxyConsent").check();
 await page.locator("#loadDevices").click();
 await page.locator("button.item[data-id='light']").waitFor({timeout:12000});
 assert.match(await page.locator("#status").innerText(),/Дом загружен/);
 assert.ok((await page.locator("#stats").innerText()).includes("1 устройств"));
 assert.match(await page.locator("#tokenCheck").innerText(),/Токен подтверждён/);
 const diagnostics=await page.locator("#networkDiagnosticLog").textContent();
 assert.match(diagnostics,/response_headers/);
 assert.match(diagnostics,/body_complete/);
 assert.match(diagnostics,/load_success/);
 assert.ok(!diagnostics.includes("synthetic-fake-oauth-token-123456"),"Diagnostic log must not contain the token");
 assert.equal(await page.locator(".load-activity .load-runner").count(),1);
 console.log("PASS: safe client diagnostics, streaming byte trace, activity animation and token exclusion");
 console.log("PASS: on-page real app JavaScript renders simulated kitchen light without a profile entitlement");
 const home=await context.newPage();
 const homepageErrors=[];
 home.on("pageerror",err=>homepageErrors.push(String(err).slice(0,80)));
 await home.goto("https://mapkepp.github.io/tools/?browser-e2e=historic-shortcuts",{waitUntil:"domcontentloaded",timeout:45000});
 assert.equal(await home.locator("#generator").count(),1);
 assert.equal(await home.locator("#sign").count(),1);
 assert.equal(await home.locator('a[href="./studio/"]').count()>0,true);
 await home.locator("#targetId").fill("synthetic-kitchen-light");
 await home.locator("#capability").selectOption("on");
 assert.match(await home.locator("#preview").innerText(),/synthetic-kitchen-light/);
 await home.locator("#capability").selectOption("off");
 assert.match(await home.locator("#preview").innerText(),/false/);
 assert.equal(homepageErrors.length,0,"Classic homepage should not throw JavaScript errors");
 console.log("PASS: classic homepage generator ON/OFF preview, new studio link and zero JS errors");
 await home.close();
 if(errors.length)console.log("Browser page errors (redacted count):",errors.length);
}finally{
 await browser.close();
}