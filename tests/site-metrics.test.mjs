import test from "node:test";
import assert from "node:assert/strict";
import handler from "../supabase/functions/site-metrics/handler.js";
const ORIGIN="https://mapkepp.github.io";
function req(method,body,origin=ORIGIN){
 return new Request("https://metrics.invalid/",{
  method,headers:{"Origin":origin,...(method==="POST"?{"Content-Type":"text/plain;charset=UTF-8"}:{})},
  ...(method==="POST"?{body:JSON.stringify(body)}:{})
 });
}
test("private counters allow only aggregate page and action enums",async()=>{
 let calls=0;
 const previous=globalThis.fetch, oldDeno=globalThis.Deno;
 globalThis.Deno={env:{get:x=>x==="SUPABASE_URL"?"https://test-supabase.invalid":
   x==="SUPABASE_SECRET_KEYS"?JSON.stringify({default:"fake-server-secret"}):undefined}};
 const counts=new Map([["home",{page:"home",visits:0,uses:0}],["studio",{page:"studio",visits:0,uses:0}]]);
 try{
  globalThis.fetch=async(url,opts)=>{
   calls++;assert.ok(!JSON.stringify(opts).includes("device_name"));
   assert.ok(!JSON.stringify(opts).includes("oauth_token"));
   assert.equal(opts.headers.apikey,"fake-server-secret");
   assert.equal(opts.headers.Authorization,undefined);
   if(url.endsWith("mapkepp_site_metrics?select=page,visits,uses"))
    return Response.json([...counts.values()]);
   assert.ok(url.endsWith("rpc/mapkepp_count_site_event"));
   const event=JSON.parse(opts.body);
   const row=counts.get(event.p_page);
   row[event.p_event==="visit"?"visits":"uses"]++;
   return Response.json([row]);
  };
  const rejects=[
   {page:"home",event:"visit",token:"should-never-leave"},
   {page:"home",event:"use",device_name:"private"},
   {page:"home",event:"use",device_id:"private"},
   {page:"home",event:"use",user:"private"},
   {page:"extra",event:"visit"},
   {page:"home",event:"signin"}
  ];
  for(const body of rejects){
   const response=await handler.fetch(req("POST",body));
   assert.equal(response.status,400);
   assert.equal((await response.json()).error,"invalid_event");
  }
  assert.equal(calls,0,"rejected requests never reach database");
  assert.equal((await handler.fetch(req("POST",{page:"studio",event:"use"}))).status,200);
  assert.equal((await handler.fetch(req("POST",{page:"home",event:"visit"}))).status,200);
  assert.equal((await handler.fetch(req("POST",{page:"home",event:"use"}))).status,200);
  const read=await handler.fetch(req("GET"));
  assert.equal(read.status,200);
  assert.equal(read.headers.get("Access-Control-Allow-Origin"),ORIGIN);
  assert.deepEqual(await read.json(),{pages:{home:{visits:1,uses:1},studio:{visits:0,uses:1}},total:{visits:1,uses:2}});
  assert.equal(calls,7);
  assert.equal((await handler.fetch(req("POST",{page:"home",event:"visit"},"https://attacker.invalid"))).status,403);
  assert.equal((await handler.fetch(req("GET",null,"https://attacker.invalid"))).status,403);
  assert.equal(calls,7,"no database requests for untrusted origins");
 }finally{globalThis.fetch=previous;globalThis.Deno=oldDeno;}
});
