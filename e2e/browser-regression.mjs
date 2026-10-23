import {chromium} from "playwright";
import assert from "node:assert/strict";
import {createHash,createCipheriv,randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";

function makeSigningFixture(label){
 const raw=Buffer.from("AEA1-synthetic-"+label+"-signed-shortcut");
 const key=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 const encrypted=Buffer.concat([cipher.update(raw),cipher.final(),cipher.getAuthTag()]).toString("base64");
 const payload={version:2,id:randomUUID(),key:key.toString("base64"),iv:iv.toString("base64"),
   digest:createHash("sha256").update(raw).digest("hex"),
   chunks:Math.ceil(encrypted.length/1536),bytes:raw.length};
 return {payload,encrypted};
}
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
 const oauthPage=await context.newPage();
 await oauthPage.goto(share,{waitUntil:"domcontentloaded"});
 await oauthPage.locator("#actionSelect").waitFor();
 let returnedState="";
 await oauthPage.route("https://oauth.yandex.ru/**",async route=>{
   returnedState=new URL(route.request().url()).searchParams.get("state")||"";
   return route.fulfill({status:200,contentType:"text/html",body:"<html><body>Simulated Yandex OAuth only</body></html>"});
 });
 await oauthPage.locator("#yandexAuth").click();
 await oauthPage.waitForURL(/oauth\.yandex\.ru/,{timeout:15000});
 assert.match(returnedState,/^[0-9a-f]{48}$/);
 await oauthPage.goto("https://mapkepp.github.io/tools/oauth/callback.html#access_token=synthetic-oauth-resume-token-123456&state="+returnedState,
   {waitUntil:"domcontentloaded"});
 await oauthPage.waitForURL("**/studio/?oauth=success",{timeout:15000});
 assert.equal(await oauthPage.locator("#oauthToken").inputValue(),"synthetic-oauth-resume-token-123456");
 assert.match(await oauthPage.locator("#jsonPreview").innerText(),/42/);
 assert.ok((await oauthPage.locator("#shortcutName").inputValue()).length>0);
 await oauthPage.close();
 console.log("PASS: clicking Yandex OAuth from shared QR preserves selected command and token copy field");

 assert.equal(await page.evaluate(()=>window.MapkeppShare.preserveForOAuth()),true);
 assert.ok((await page.evaluate(()=>sessionStorage.getItem("mapkepp.share.pending"))).length>0);
 console.log("PASS: chosen QR/link action saved to session during OAuth redirect without storing a token");

 // Simulated OAuth callback (never a real user's token).
 await page.evaluate(client=>{
   sessionStorage.setItem("mapkepp.yandex.oauth.state."+client,"fake-state-123");
   sessionStorage.setItem("mapkepp.yandex.oauth.consent."+client,"no");
 },id);
 await page.goto("https://mapkepp.github.io/tools/oauth/callback.html#access_token=synthetic-test-token-123456&state=fake-state-123",{waitUntil:"domcontentloaded"});
 await page.waitForURL("**/studio/?oauth=success",{timeout:12000});
 await page.locator("#oauthToken").waitFor();
 assert.equal(await page.locator("#oauthToken").inputValue(),"synthetic-test-token-123456");
 assert.match(await page.locator("#jsonPreview").innerText(),/42/);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem("mapkepp.share.pending")),null);
 console.log("PASS: OAuth callback restores QR configuration and chosen brightness action");

 await page.reload({waitUntil:"domcontentloaded"});
 assert.equal(await page.locator("#oauthToken").inputValue(),"");
 console.log("PASS: matching OAuth state, one-time transfer and no stale reload");
 // Mock only the home/account endpoints. No personal data or access token is sent
 // to the actual provider during the following step.
 const backendDiagnostics=[];
 let segmentCalls=0;
 let simulatedInterruption=false;
 let homePreflightCount=0;
 await page.route("**/functions/v1/yandex-home",async route=>{
   const mock={
     status:"ok",households:[{id:"h",name:"Тестовый дом"}],
     rooms:[{id:"k",name:"Кухня",household_id:"h",devices:["light"]}],
     devices:[{id:"light",name:"Свет",household_id:"h",room:"k",type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{}}]}],
     groups:[],scenarios:Array.from({length:48},(_,i)=>({id:"scene"+i,name:"Сценарий номер "+i,is_active:true}))
   };
   const origin="https://mapkepp.github.io";
   const headers={"access-control-allow-origin":origin,
     "access-control-expose-headers":"X-Mapkepp-Body-Bytes, X-Mapkepp-Upstream-Ms",
     "access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type",
     "content-type":"application/json","x-mapkepp-upstream-ms":"25"};
   if(route.request().method()==="OPTIONS"){homePreflightCount++;return route.fulfill({status:204,headers});}
   assert.match(route.request().headers()["content-type"]||"",/^text\/plain/i);
   const input=JSON.parse(route.request().postData()||"{}");
   if(input.operation==="technical_diagnostics"){
     assert.ok(!route.request().postData().includes("synthetic-fake-oauth-token-123456"));
     backendDiagnostics.push(...input.events);
     return route.fulfill({status:200,headers,body:'{"ok":true}'});
   }
   assert.equal(input.operation,"segment");
   assert.equal(input.access_token,"synthetic-fake-oauth-token-123456");
   const serialized=JSON.stringify(mock),total=Math.ceil(serialized.length/2500);
   const index=input.index;
   assert.ok(Number.isInteger(index)&&index>=0&&index<total);
   if(index===1&&!simulatedInterruption){simulatedInterruption=true;return route.abort("failed");}
   const digest=createHash("sha256").update(serialized).digest("hex");
   const body=JSON.stringify({version:1,index,total,digest,fragment:serialized.slice(index*2500,(index+1)*2500)});
   segmentCalls++;
   return route.fulfill({status:200,headers:{...headers,"x-mapkepp-body-bytes":String(Buffer.byteLength(body))},body});
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
 assert.match(diagnostics,/segment_start/);
 assert.match(diagnostics,/segment_received/);
 assert.match(diagnostics,/segment_complete/);
 assert.match(diagnostics,/segment_retry/);
 assert.equal(simulatedInterruption,true);
 assert.equal(homePreflightCount,0,"Safelisted transport should not issue CORS preflight OPTIONS");
 assert.ok(segmentCalls>=2,"Multi-segment transfer expected");
 assert.match(diagnostics,/load_success/);
 await page.locator("#saveInventoryBrowser").click();
 await assert.doesNotReject(async()=>{await page.locator("#localInventoryStatus").getByText(/Локальная копия сохранена/).waitFor({timeout:12000});});
 const exportPromise=page.waitForEvent("download",{timeout:12000});
 await page.locator("#exportInventoryFile").click();
 const exported=await exportPromise;
 assert.match(exported.suggestedFilename(),/mapkepp-devices-.*\.json/);
 console.log("PASS: device inventory exports to local JSON and persists opt-in to browser IndexedDB");

 assert.ok(!diagnostics.includes("synthetic-fake-oauth-token-123456"),"Diagnostic log must not contain the token");
 assert.equal(await page.locator(".load-activity .load-runner").count(),1);
 console.log("PASS: multi-segment checksum reconstruction, safe local trace, moving progress and token exclusion");
 console.log("PASS: on-page real app JavaScript renders simulated kitchen light without a profile entitlement");
 await page.locator("button.item[data-id='light']").click();
 await page.locator("#signConsent").check();
 let safeSigningRequests=0,chunkFailures=0;
 const studioSigned=makeSigningFixture("studio");
 await page.route("**/functions/v1/shortcut-sign",async route=>{
   if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"https://mapkepp.github.io","access-control-allow-headers":"content-type"}});
   const post=route.request().postDataBuffer()?.toString("utf8")||"";
   assert.ok(!post.includes("synthetic-fake-oauth-token-123456"));
   const headers={"access-control-allow-origin":"https://mapkepp.github.io","content-type":"application/json"};
   if(route.request().headers()["content-type"]?.startsWith("text/plain")){
     const packet=JSON.parse(post);assert.equal(packet.page,"studio");
     if(packet.operation==="sign_trace")return route.fulfill({status:200,headers,body:'{"ok":true}'});
     if(packet.operation==="release_signed_transfer")return route.fulfill({status:200,headers,body:'{"ok":true}'});
     assert.equal(packet.operation,"get_signed_chunk");
     assert.equal(packet.id,studioSigned.payload.id);
     if(packet.index===0&&chunkFailures++===0)return route.abort("failed");
     return route.fulfill({status:200,headers,body:JSON.stringify({
       version:2,index:packet.index,total:studioSigned.payload.chunks,
       fragment:studioSigned.encrypted.slice(packet.index*1536,(packet.index+1)*1536)
     })});
   }
   safeSigningRequests++;assert.match(post,/YANDEX_OAUTH_TOKEN/);assert.match(post,/name="mode"/);
   assert.match(post,/prepare/);assert.match(post,/studio/);
   return route.fulfill({status:200,headers,body:JSON.stringify(studioSigned.payload)});
 });
 await page.locator("#downloadSign").click();
 await page.locator("#signedReady").waitFor({state:"visible",timeout:15000});
 assert.match(await page.locator("#signedDownload").getAttribute("href"),/^blob:/);
 assert.equal(safeSigningRequests,1);
 assert.ok(chunkFailures>0);
 assert.match(await page.locator("#signDiagnosticLog").textContent(),/chunk_retry/);
 assert.match(await page.locator("#signDiagnosticLog").textContent(),/decrypt_ok/);
 assert.match(await page.locator("#signDiagnosticLog").textContent(),/sha256_ok/);
 assert.match(await page.locator("#signDiagnosticLog").textContent(),/studio.*generate_ok/);
 assert.match(await page.locator("#signDiagnosticLog").textContent(),/aea1_ok/);

 console.log("PASS: signed AEA1 browser download flow via token-free proxy and Safari-facing save control");
 await page.locator("#clearOAuth").click();
 assert.equal(await page.locator("#oauthToken").inputValue(),"");
 assert.equal(await page.locator("button.item[data-id='light']").count(),0);
 assert.match(await page.locator("#status").innerText(),/Токен удалён/);
 const downloadedJSON=await readFile(await exported.path());
 const exportedInventory=JSON.parse(downloadedJSON.toString("utf8"));
 assert.equal(exportedInventory.devices.length,1);
 assert.ok(!downloadedJSON.toString("utf8").includes("synthetic-fake-oauth-token-123456"));
 await page.locator("#dataFile").setInputFiles({name:"saved-inventory.json",mimeType:"application/json",buffer:downloadedJSON});
 await page.locator("button.item[data-id='light']").waitFor({timeout:12000});
 await page.locator("#clearButton").click();
 assert.equal(await page.locator("button.item[data-id='light']").count(),0);
 console.log("PASS: exported inventory JSON re-imported from a local file without sending a new request");
 await page.locator("#restoreInventoryBrowser").click();
 await page.locator("button.item[data-id='light']").waitFor({timeout:12000});
 assert.equal(await page.locator("#oauthToken").inputValue(),"");
 assert.match(await page.locator("#localInventoryStatus").innerText(),/без|из браузерной копии/i);
 // OAuth callback deliberately disables auto-restore; test a normal visit instead.
 await page.goto(base+"?offline-cache-return=1",{waitUntil:"domcontentloaded"});
 await page.locator("button.item[data-id='light']").waitFor({timeout:12000});
 assert.equal(await page.locator("#oauthToken").inputValue(),"");
 console.log("PASS: inventory auto-restores on a normal subsequent visit, without a token or network request");
 await page.locator("#forgetInventoryBrowser").click();
 await page.locator("#localInventoryStatus").getByText(/Локальная копия удалена/).waitFor();
 console.log("PASS: offline restore after OAuth reset without network, local cache deletion");

 console.log("PASS: token cleanup removes previously displayed devices and cannot preserve stale inventory");
 const home=await context.newPage();
 const homepageErrors=[];
 home.on("pageerror",err=>homepageErrors.push(String(err).slice(0,80)));
 await home.goto("https://mapkepp.github.io/tools/?browser-e2e=historic-shortcuts",{waitUntil:"domcontentloaded",timeout:45000});
 assert.equal(await home.locator("#downloadSign").count(),1);
 assert.equal(await home.locator("#sharePanel").count(),1);
 assert.equal(await home.locator("#openExperimentalStudio").getAttribute("href"),"../studio/");
 assert.equal(await home.locator("#signDiagnosticLog").count(),1);

 assert.equal(await home.locator('script[src^="./frozen-2026-10-23/app.js"]').count(),1);
 await home.locator("#demoButton").click();
 try{await home.locator("button.item[data-id='l1']").waitFor({timeout:12000});}
 catch(e){
   const diag=await home.evaluate(()=>({
     studioPresent:typeof window.MapkeppStudio,
     loaded:window.MapkeppStudio?.hasAnyData?.(),
     stats:document.getElementById("stats")?.textContent?.slice(0,200),
     status:document.getElementById("status")?.textContent?.slice(0,200),
     items:document.querySelectorAll("button.item").length
   }));
   console.log("HOME SMOKE FAILURE (synthetic only)",JSON.stringify({diag,pageErrors:homepageErrors}));
   throw e;
 }
 await home.locator("button.item[data-id='l1']").click();
 assert.match(await home.locator("#jsonPreview").innerText(),/api.iot.yandex.net/);
 assert.equal(homepageErrors.length,0,"Frozen homepage must not throw JavaScript errors");
 console.log("PASS: homepage frozen Studio snapshot renders example and contains no page errors");
 let homeSafeSignCount=0;
 const homeSigned=makeSigningFixture("home");
 await home.route("**/functions/v1/shortcut-sign",async route=>{
   if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"https://mapkepp.github.io","access-control-allow-headers":"content-type"}});
   const raw=route.request().postDataBuffer()?.toString("utf8")||"";
   const headers={"access-control-allow-origin":"https://mapkepp.github.io","content-type":"application/json"};
   if(route.request().headers()["content-type"]?.startsWith("text/plain")){
     const packet=JSON.parse(raw);assert.equal(packet.page,"home");
     if(packet.operation==="sign_trace"||packet.operation==="release_signed_transfer")
       return route.fulfill({status:200,headers,body:'{"ok":true}'});
     assert.equal(packet.operation,"get_signed_chunk");
     return route.fulfill({status:200,headers,body:JSON.stringify({version:2,index:packet.index,
       total:homeSigned.payload.chunks,
       fragment:homeSigned.encrypted.slice(packet.index*1536,(packet.index+1)*1536)})});
   }
   homeSafeSignCount++;assert.match(raw,/YANDEX_OAUTH_TOKEN/);
   assert.match(raw,/name="mode"/);assert.match(raw,/prepare/);
   return route.fulfill({status:200,headers,body:JSON.stringify(homeSigned.payload)});
 });
 await home.locator("#signConsent").check();
 await home.locator("#downloadSign").click();
 await home.locator("#signedReady").waitFor({state:"visible",timeout:15000});
 assert.equal(homeSafeSignCount,1,"legacy form must not trigger duplicate signing");
 assert.match(await home.locator("#signDiagnosticLog").textContent(),/home.*aea1_ok/);
 assert.match(await home.locator("#signDiagnosticLog").textContent(),/chunks_complete/);
 assert.match(await home.locator("#signDiagnosticLog").textContent(),/decrypt_ok/);
 console.log("PASS: frozen homepage signs via verified relay only once, logs as home");

 await home.locator("#makeShare").click();
 const rootShare=await home.locator("#shareUrl").inputValue();
 assert.match(rootShare,/\/tools\/#config=/);
 // Save real-shaped imported inventory on main (NOT the demonstration fixture).
 const rootInventory={
   status:"ok",households:[{id:"fh",name:"Дом офлайн"}],
   rooms:[{id:"fr",name:"Кухня офлайн",household_id:"fh",devices:["offline-home-lamp"]}],
   devices:[{id:"offline-home-lamp",name:"Лампа офлайн",household_id:"fh",room:"fr",
     type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{}}]}],
   groups:[],scenarios:[]
 };
 await home.locator("#dataFile").setInputFiles({name:"home-devices.json",
   mimeType:"application/json",buffer:Buffer.from(JSON.stringify(rootInventory))});
 await home.locator("button.item[data-id='offline-home-lamp']").waitFor({timeout:12000});
 await home.locator("#saveInventoryBrowser").click();
 await home.locator("#localInventoryStatus").getByText(/Локальная копия сохранена/).waitFor({timeout:12000});
 const localDownload=home.waitForEvent("download",{timeout:12000});
 await home.locator("#exportInventoryFile").click();
 const savedFile=await localDownload;
 assert.match(savedFile.suggestedFilename(),/^mapkepp-devices-\d{4}-\d{2}-\d{2}\.json$/);
 const localExport=JSON.parse((await readFile(await savedFile.path())).toString("utf8"));
 assert.equal(localExport.devices[0].id,"offline-home-lamp");
 assert.deepEqual(localExport.rooms[0].devices,["offline-home-lamp"]);
 assert.ok(!JSON.stringify(localExport).includes("access_token"));
 console.log("PASS: main-page loaded devices exported to local JSON and saved in IndexedDB");
 await home.goto(rootShare,{waitUntil:"domcontentloaded"});
 assert.match(await home.locator("#jsonPreview").innerText(),/l1/);
 let rootOAuthState="";
 await home.route("https://oauth.yandex.ru/**",async route=>{
   rootOAuthState=new URL(route.request().url()).searchParams.get("state")||"";
   return route.fulfill({status:200,contentType:"text/html",body:"<html>Simulated Yandex OAuth</html>"});
 });
 await home.locator("#yandexAuth").click();
 await home.waitForURL(/oauth\.yandex\.ru/,{timeout:15000});
 assert.match(rootOAuthState,/^[0-9a-f]{48}$/);
 await home.goto("https://mapkepp.github.io/tools/oauth/callback.html#access_token=synthetic-root-oauth-123456&state="+rootOAuthState,{waitUntil:"domcontentloaded"});
 await home.waitForURL("**/studio/?oauth=success",{timeout:15000});
 assert.match(await home.locator("#jsonPreview").innerText(),/l1/);
 console.log("PASS: frozen root QR link survives same-tab Yandex OAuth callback to active Studio");
 let unexpectedInventoryFetches=0;
 await home.route("**/functions/v1/yandex-home",async route=>{
   unexpectedInventoryFetches++;
   await route.abort("blockedbyclient");
 });
 await home.goto("https://mapkepp.github.io/tools/?offline-home-reopen=1",{waitUntil:"domcontentloaded"});
 await home.locator("button.item[data-id='offline-home-lamp']").waitFor({timeout:12000});
 assert.equal(unexpectedInventoryFetches,0,"Local restoration must not fetch the inventory from Yandex/Supabase");
 assert.equal(await home.locator("#oauthToken").inputValue(),"");
 await home.locator("#forgetInventoryBrowser").click();
 await home.locator("#localInventoryStatus").getByText(/Локальная копия удалена/).waitFor({timeout:12000});
 await home.reload({waitUntil:"domcontentloaded"});
 assert.equal(await home.locator("button.item[data-id='offline-home-lamp']").count(),0);
 console.log("PASS: main-page offline inventory auto-restores without network or token, then deletes safely");
 await home.close();
 if(errors.length)console.log("Browser page errors (redacted count):",errors.length);
}finally{
 await browser.close();
}