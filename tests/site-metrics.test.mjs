import test from "node:test";
import assert from "node:assert/strict";
import handler from "../supabase/functions/site-metrics/handler.js";
const ORIGIN="https://mapkepp.github.io";
const req=(method,body,origin=ORIGIN)=>new Request("https://metrics.invalid/",{
 method,headers:{Origin:origin,...(method==="POST"?{"Content-Type":"text/plain;charset=UTF-8"}:{})},
 ...(method==="POST"?{body:JSON.stringify(body)}:{})
});
test("anonymous unique-browser counters never accept identifiers, device names or OAuth",async()=>{
 let calls=0;
 const previous=globalThis.fetch,oldDeno=globalThis.Deno;
 globalThis.Deno={env:{get:x=>x==="SUPABASE_URL"?"https://test-supabase.invalid":
   x==="SUPABASE_SECRET_KEYS"?JSON.stringify({default:"fake-server-secret"}):undefined}};
 const counters=new Map(["home","studio"].map(page=>[page,{page,visits:0,uses:0,unique_browsers:0}]));
 const siteTotal={unique_browsers:0};
 try{
   globalThis.fetch=async(url,opts)=>{
     calls++;
     assert.ok(!JSON.stringify(opts).includes("device_name"));
     assert.ok(!JSON.stringify(opts).includes("oauth_token"));
     assert.equal(opts.headers.apikey,"fake-server-secret");
     assert.equal(opts.headers.Authorization,undefined);
     if(url.endsWith("mapkepp_site_metrics?select=page,visits,uses,unique_browsers"))
       return Response.json([...counters.values()]);
     if(url.endsWith("mapkepp_site_unique_totals?select=unique_browsers&id=eq.1"))
       return Response.json([siteTotal]);
     assert.ok(url.endsWith("rpc/mapkepp_count_site_event"));
     const event=JSON.parse(opts.body);
     assert.deepEqual(Object.keys(event).sort(),["p_event","p_page"]);
     const row=counters.get(event.p_page);
     if(event.p_event==="visit")row.visits++;
     if(event.p_event==="use")row.uses++;
     if(event.p_event==="unique_first"){row.unique_browsers++;siteTotal.unique_browsers++;}
     if(event.p_event==="unique_page")row.unique_browsers++;
     return Response.json([row]);
   };
   const reject=[
    {page:"home",event:"visit",token:"should-never-leave"},
    {page:"home",event:"unique_first",visitor_id:"secret-visitor"},
    {page:"home",event:"unique_first",device_name:"private"},
    {page:"home",event:"unique_page",cookie:"private"},
    {page:"home",event:"use",device_id:"private"},
    {page:"home",event:"use",user:"private"},
    {page:"extra",event:"visit"},
    {page:"home",event:"signin"}
   ];
   for(const body of reject){
     const response=await handler.fetch(req("POST",body));
     assert.equal(response.status,400);
     assert.equal((await response.json()).error,"invalid_event");
   }
   assert.equal(calls,0,"All rejected payloads stop before the database");
   for(const [page,event] of [
     ["home","unique_first"],["home","visit"],["home","use"],
     ["studio","unique_page"],["studio","visit"]]){
     assert.equal((await handler.fetch(req("POST",{page,event}))).status,200);
   }
   const read=await handler.fetch(req("GET"));
   assert.equal(read.status,200);
   assert.equal(read.headers.get("Access-Control-Allow-Origin"),ORIGIN);
   assert.deepEqual(await read.json(),{
     pages:{home:{visits:1,uses:1,uniqueBrowsers:1},
       studio:{visits:1,uses:0,uniqueBrowsers:1}},
     total:{visits:2,uses:1,uniqueBrowsers:1}
   });
   const before=calls;
   assert.equal((await handler.fetch(req("POST",{page:"home",event:"unique_first"},"https://attacker.invalid"))).status,403);
   assert.equal((await handler.fetch(req("GET",null,"https://attacker.invalid"))).status,403);
   assert.equal(calls,before,"Untrusted origins never reach the database");
 }finally{globalThis.fetch=previous;globalThis.Deno=oldDeno;}
});
