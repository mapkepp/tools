import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("all studio scripts parse without syntax errors",async()=>{
 for(const p of ["studio/app.js","studio/share.js","studio/yandex-widget.js","studio/history.js"]){
   const source=await read(p);assert.doesNotThrow(()=>new vm.Script(source,{filename:p}));
 }
});
test("OAuth temp token is isolated from earlier clients and expires in five minutes",async()=>{
 const app=await read("studio/app.js");
 const callback=await read("oauth/callback.html");
 assert.match(app,/TOKEN_TIME_KEY/);
 assert.match(callback,/sessionStorage\.setItem\(TOKEN_TIME_KEY,String\(Date\.now\(\)\)\)/);
 assert.match(app,/Date\.now\(\)-issuedAt<300000/);
 assert.match(app,/mapkepp\.yandex\.oauth\.tmp\."\+OAUTH_CLIENT_ID/);
 assert.match(app,/input\.value="";/);
 assert.match(app,/input\.readOnly=true/);
 assert.match(app,/sessionStorage\.removeItem\(key\)/);
 assert.doesNotMatch(callback,/a0f04364eb374e6a9297ca708c959218/);
});
test("device results complete before optional Yandex profile request",async()=>{
 const app=await read("studio/app.js");
 const start=app.indexOf("async function loadFromYandex(){");
 const end=app.indexOf("async function readYandexIdentity(",start);
 const body=app.slice(start,end);
 assert.ok(body.includes('loadRaw(JSON.stringify(parsed))'));
 assert.ok(body.includes('void readYandexIdentity(token)'));
 assert.ok(!body.includes('await readYandexIdentity(token)'));
 assert.ok(body.includes("setTimeout(endProgress,2000)"));
});
test("local history is opt-in and never persists a token",async()=>{
 const app=await read("studio/app.js");
 const history=await read("studio/history.js");
 const html=await read("studio/index.html");
 assert.match(html,/id="saveHistory"/);
 assert.match(html,/id="importHistory"/);
 assert.match(history,/addEventListener\("click"/);
 assert.match(history,/localStorage\.setItem\(KEY,blob\)/);
 assert.match(history,/window\.MapkeppStudio\.getShareData\(\)/);
 assert.match(history,/MAX=30/);
 assert.doesNotMatch(history,/oauthToken|access_token|client_secret/);
 assert.match(app,/getShareData\(\)/);
});
test("official Yandex personal button mounts on load but does not persist credentials",async()=>{
 const s=await read("studio/yandex-widget.js");
 assert.match(s,/DOMContentLoaded/);
 assert.match(s,/suggest\.handler\(\)/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|console\.log/);
 assert.match(s,/typeof data\?\.access_token/);
});
