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
  const j=await r.json();
  assert.equal(Number(r.headers.get("x-mapkepp-body-bytes")),new TextEncoder().encode(JSON.stringify(j)).byteLength);
  assert.ok(Number(r.headers.get("x-mapkepp-upstream-ms"))>=0);
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
test("compact transport preserves all actionable settings and hierarchy, drops bulky unused details",async()=>{
  const enriched={
    status:"ok",
    request_id:"private-upstream-id",
    households:[{id:"home",name:"Дом"}],
    rooms:[{id:"room",name:"Кухня",household_id:"home",devices:["light"]}],
    devices:[{
      id:"light",name:"Лампа",household_id:"home",room:"room",type:"devices.types.light",
      external_id:"vendor-specific",aliases:["alternate"],
      properties:[{type:"sensor",state:{value:"unused".repeat(12000)}}],
      capabilities:[
        {type:"devices.capabilities.on_off",parameters:{},last_updated:123},
        {type:"devices.capabilities.range",parameters:{instance:"brightness",range:{min:1,max:100,precision:1},unit:"irrelevant"},state:{value:42},last_updated:123},
        {type:"devices.capabilities.mode",parameters:{instance:"work",modes:[{value:"auto",description:"not needed"}]}},
        {type:"devices.capabilities.color_setting",parameters:{temperature_k:{min:2500,max:6000}}},
        {type:"devices.capabilities.toggle",parameters:{instance:"mute"}}
      ]
    }],
    groups:[{id:"group",name:"Лампы",household_id:"home",devices:["light"],capabilities:[{type:"devices.capabilities.on_off",parameters:{}}]}],
    scenarios:[{id:"scenario",name:"Вечер",is_active:false}]
  };
  const mocked=compiler(async()=>new Response(JSON.stringify(enriched),{status:200,headers:{"content-type":"application/json"}}),{info(){}},AbortSignal);
  const response=await mocked.fetch(request("POST",origin,{access_token:token}));
  const reduced=await response.json();
  assert.equal(response.status,200);
  assert.ok(JSON.stringify(reduced).length<JSON.stringify(enriched).length/10);
  assert.deepEqual(reduced.rooms[0].devices,["light"]);
  assert.deepEqual(reduced.groups[0].devices,["light"]);
  assert.equal(reduced.devices[0].room,"room");
  assert.deepEqual(reduced.devices[0].capabilities.map(x=>x.type),[
    "devices.capabilities.on_off","devices.capabilities.range",
    "devices.capabilities.mode","devices.capabilities.color_setting"
  ]);
  assert.equal(reduced.devices[0].capabilities[1].parameters.range.max,100);
  assert.equal(reduced.devices[0].capabilities[1].state.value,42);
  assert.deepEqual(reduced.devices[0].capabilities[2].parameters.modes,[{value:"auto"}]);
  assert.equal(reduced.devices[0].capabilities[3].parameters.temperature_k.max,6000);
  assert.equal(reduced.scenarios[0].is_active,false);
  assert.equal(reduced.devices[0].external_id,undefined);
  assert.equal(reduced.request_id,undefined);
  assert.equal(JSON.stringify(reduced).includes("unused"),false);
});
test("segment responses can reassemble a large device listing without cloud storage",async()=>{
  const bulky={
    status:"ok",households:[{id:"h",name:"Дом"}],rooms:[],
    devices:Array.from({length:110},(_,i)=>({
      id:"light_"+i,name:"Многофункциональная лампа "+i,household_id:"h",
      capabilities:[{type:"devices.capabilities.on_off",parameters:{}}]
    })),groups:[],scenarios:[]
  };
  const stub=compiler(async()=>new Response(JSON.stringify(bulky),{status:200}),{info(){}},AbortSignal);
  const pieces=[];
  let digest,parts;
  for(let index=0;;index++){
    const response=await stub.fetch(request("POST",origin,{access_token:token,operation:"segment",index}));
    assert.equal(response.status,200);
    const result=await response.json();
    if(index===0){digest=result.digest;parts=result.total;assert.ok(parts>1);}
    assert.equal(result.index,index);
    assert.equal(result.total,parts);
    assert.equal(result.digest,digest);
    assert.ok(result.fragment.length<=2500);
    pieces.push(result.fragment);
    if(index===parts-1)break;
  }
  const joined=pieces.join("");
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(joined)));
  const hex=Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
  assert.equal(hex,digest);
  assert.equal(JSON.parse(joined).devices.length,110);
});
test("remote technical diagnostics accept only code and bounded numeric fields, never arbitrary strings",async()=>{
  const records=[];
  const recording=compiler(async()=>{throw Error("must not reach Yandex");},{info:(line)=>records.push(line)},AbortSignal);
  const valid=await recording.fetch(request("POST",origin,{operation:"technical_diagnostics",events:[
    {code:"segment_received",index:2,bytes:1024,elapsed_ms:340,note:"PRIVATE-NAME-DO-NOT-LOG"}
  ]}));
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).accepted,1);
  assert.equal(records.length,1);
  assert.match(records[0],/segment_received/);
  assert.equal(records[0].includes("PRIVATE-NAME"),false);
  const invalid=await recording.fetch(request("POST",origin,{operation:"technical_diagnostics",events:[
    {code:"evil_event",secret:"PRIVATE-NAME"}
  ]}));
  assert.equal(invalid.status,400);
  assert.equal(records.length,1);
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
