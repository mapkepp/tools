import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const read=name=>readFile(new URL("../"+name,import.meta.url),"utf8");
const ID="e5942ee8886149dfadc84fa3bc89049a";
const OLD="a0f04364eb374e6a9297ca708c959218";
const CALLBACK="https://mapkepp.github.io/tools/oauth/callback.html";

test("public OAuth URL and official SDK use only the newly registered client",async()=>{
 const html=await read("studio/index.html");
 const widget=await read("studio/yandex-widget.js");
 const links=[html,widget];
 for(const s of links){assert.ok(s.includes(ID));assert.ok(!s.includes(OLD));}
 const href=html.match(/href="(https:\/\/oauth\.yandex\.ru\/authorize[^"]+)" id="yandexAuth"/)?.[1]?.replaceAll("&amp;","&");
 assert.ok(href);
 const u=new URL(href);
 assert.equal(u.searchParams.get("client_id"),ID);
 assert.equal(u.searchParams.get("response_type"),"token");
 assert.equal(u.searchParams.get("redirect_uri"),CALLBACK);
 assert.ok(u.searchParams.get("scope").split(" ").includes("iot:view"));
 assert.ok(u.searchParams.get("scope").split(" ").includes("iot:control"));
 assert.match(widget,/YaAuthSuggest\.init/);
 assert.match(widget,/sdk-suggest-with-polyfills-latest\.js/);
 assert.match(widget,/parentId:\s*"yandexButtonContainer"/);
 assert.match(widget,/new Event\("input"/);
 assert.match(widget,/DOMContentLoaded/);
 assert.doesNotMatch(widget,/console\.log|localStorage|JSON\.stringify\(result\)/);
});

test("the callback supports SDK message delivery while retaining ordinary OAuth state checks",async()=>{
 const html=await read("oauth/callback.html");
 const s=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(s);
 assert.doesNotThrow(()=>new vm.Script(s));
 assert.match(s,/sdk-suggest-token-with-polyfills-latest\.js/);
 assert.match(s,/YaSendSuggestToken\("https:\/\/mapkepp\.github\.io"/);
 assert.match(s,/!expectedState\|\|!returnedState\|\|expectedState!==returnedState/);
 assert.match(s,/history\.replaceState\(null,"",location\.pathname\)/);
});

test("normal OAuth and widget scripts have no tokens embedded",async()=>{
 for(const file of ["studio/index.html","studio/yandex-widget.js","oauth/callback.html"]){
  const text=await read(file);
  assert.doesNotMatch(text,/y0__[A-Za-z0-9]{10,}/);
  assert.doesNotMatch(text,/client_secret\s*[:=]/);
 }
});
