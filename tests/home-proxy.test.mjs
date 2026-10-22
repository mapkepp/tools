import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../api/yandex-home.js", import.meta.url), "utf8");
const compiler = new Function("fetch", "console", "AbortSignal", source.replace("export default {", "return {"));
const token = "synthetic-token-123456";
const origin = "https://mapkepp.github.io";
const requested = [];
const yandexResponse = {
  status: "ok", request_id: "synthetic-request-id",
  households: [{id:"house-1", name:"Тестовый дом"}],
  rooms: [{id:"room-1",household_id:"house-1",name:"Кухня",devices:["lamp-1"]}],
  devices: [{id:"lamp-1",household_id:"house-1",room:"room-1",name:"Тестовая лампа",capabilities:[]}],
  groups: [], scenarios: [{id:"scene-1",name:"Доброе утро",is_active:true}]
};
const fakeFetch = async(url,options) => {
  requested.push({url,authorization:options.headers.Authorization});
  return new Response(JSON.stringify(yandexResponse), {status:200,headers:{"content-type":"application/json"}});
};
const app = compiler(fakeFetch,{info(){}},AbortSignal);
const request = (method,orig,body) => ({
  method,
  headers: new Map([["origin",orig],["content-type","application/json"]]),
  text:async()=>JSON.stringify(body)
});
test("CORS preflight allowed only for the published site",async()=>{
  const good=await app.fetch(request("OPTIONS",origin));
  assert.equal(good.status,204);
  assert.equal(good.headers.get("access-control-allow-origin"),origin);
  const bad=await app.fetch(request("OPTIONS","https://attacker.example"));
  assert.equal(bad.status,403);
  assert.equal(bad.headers.get("access-control-allow-origin"),null);
});
test("only a valid token goes to a fixed Yandex URL",async()=>{
  requested.length=0;
  const r=await app.fetch(request("POST",origin,{access_token:token}));
  assert.equal(r.status,200);
  assert.equal(r.headers.get("cache-control").includes("no-store"),true);
  assert.equal(r.headers.get("access-control-expose-headers").includes("X-Mapkepp-Body-Bytes"),true);
  assert.equal(Number(r.headers.get("x-mapkepp-body-bytes")),new TextEncoder().encode(JSON.stringify(j)).byteLength);
  assert.ok(Number(r.headers.get("x-mapkepp-upstream-ms"))>=0);
  const j=await r.json();
  assert.equal(j.status,"ok");
  assert.equal(j.devices[0].id,yandexResponse.devices[0].id);
  assert.equal(j.devices[0].name,yandexResponse.devices[0].name);
  assert.deepEqual(j.rooms[0].devices,["lamp-1"]);
  assert.equal(j.request_id,undefined);
  assert.equal(JSON.stringify(j).includes(token),false);
  assert.ok(JSON.stringify(j).length<JSON.stringify(yandexResponse).length);
  assert.deepEqual(requested,[{
    url:"https://api.iot.yandex.net/v1.0/user/info",
    authorization:"Bearer "+token
  }]);
});
test("reject bad token and bad origin without contacting Yandex",async()=>{
  requested.length=0;
  const invalid=await app.fetch(request("POST",origin,{access_token:"short"}));
  assert.equal(invalid.status,400);
  const blocked=await app.fetch(request("POST","https://attacker.example",{access_token:token}));
  assert.equal(blocked.status,403);
  assert.equal(requested.length,0);
});
test("do not expose token when Yandex rejects access",async()=>{
  const rejects=compiler(async()=>new Response("forbidden",{status:401}),{info(){}},AbortSignal);
  const r=await rejects.fetch(request("POST",origin,{access_token:token}));
  assert.equal(r.status,401);
  assert.equal((await r.text()).includes(token),false);
});
test("published browser files contain no Yandex tokens",async()=>{
  const index=await fs.readFile(new URL("../studio/index.html",import.meta.url),"utf8");
  const callback=await fs.readFile(new URL("../oauth/callback.html",import.meta.url),"utf8");
  const config=await fs.readFile(new URL("../studio/backend-config.js",import.meta.url),"utf8");
  assert.ok(index.includes('id="oauthToken"'));
  assert.ok(index.includes('id="loadProgress"'));
  assert.ok(callback.includes("STATE_KEY"));
  assert.ok(config.includes('MAPKEPP_HOME_API_URL'));
  assert.ok(!/y0__[A-Za-z0-9]+/.test(index+callback+config));
});

test("Supabase free-tier function shares the reviewed read-only handler",async()=>{
  const supabaseHandler=await fs.readFile(new URL("../supabase/functions/yandex-home/handler.js",import.meta.url),"utf8");
  const entry=await fs.readFile(new URL("../supabase/functions/yandex-home/index.ts",import.meta.url),"utf8");
  const config=await fs.readFile(new URL("../supabase/config.toml",import.meta.url),"utf8");
  assert.equal(supabaseHandler,source);
  assert.ok(entry.includes("Deno.serve("));
  assert.ok(config.includes("verify_jwt = false"));
});
