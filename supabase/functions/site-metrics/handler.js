// Mapkepp Tools — aggregate, anonymous and strictly allowlisted counters.
// No cookies, tokens, IPs, device names, page URLs or visitor IDs are collected.
const ORIGIN="https://mapkepp.github.io";
const VALID_PAGES=new Set(["home","studio"]);
const VALID_EVENTS=new Set(["visit","use"]);
const cors=o=>o===ORIGIN?{
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type",
  "Access-Control-Max-Age":"600",
  "Vary":"Origin"
}:{"Vary":"Origin"};
function result(data,status,o){
 return new Response(JSON.stringify(data),{status,headers:{
  ...cors(o),"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer"
 }});
}
function credentials(){
 const env=globalThis.Deno?.env;
 const url=env?.get("SUPABASE_URL");
 const legacy=env?.get("SUPABASE_SERVICE_ROLE_KEY");
 let key=legacy;
 if(!key){try{key=JSON.parse(env?.get("SUPABASE_SECRET_KEYS")||"{}").default;}catch{}}
 if(!url||!key)throw Error("configuration_unavailable");
 return {url,key,legacy:!!legacy};
}
async function query(path,method,body){
 const {url,key,legacy}=credentials();
 const headers={apikey:key};
 if(legacy)headers.Authorization="Bearer "+key;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6500);
 try{
  const response=await fetch(url+"/rest/v1/"+path,{
   method,headers,body:body===undefined?undefined:JSON.stringify(body),
   signal:ctl.signal,redirect:"error",cache:"no-store"
  });
  if(!response.ok)throw Error("database_unavailable");
  const bodyText=await response.text();
  if(bodyText.length>3000)throw Error("oversized_database_response");
  return JSON.parse(bodyText);
 }finally{clearTimeout(timer);}
}
const zero=()=>({visits:0,uses:0});
function summarize(rows){
 const pages={home:zero(),studio:zero()};
 if(!Array.isArray(rows))throw Error("invalid_counts");
 for(const row of rows){
  if(!VALID_PAGES.has(row.page))continue;
  const visits=Number(row.visits),uses=Number(row.uses);
  if(!Number.isSafeInteger(visits)||visits<0||!Number.isSafeInteger(uses)||uses<0)
   throw Error("invalid_counts");
  pages[row.page]={visits,uses};
 }
 return {pages,total:{visits:pages.home.visits+pages.studio.visits,
  uses:pages.home.uses+pages.studio.uses}};
}
export default {
 async fetch(request){
  const origin=request.headers.get("Origin")||"";
  // Anonymous metrics are intentionally public only for the Mapkepp website.
  if(origin!==ORIGIN)return result({error:"origin_not_allowed"},403,origin);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=="GET"&&request.method!=="POST")
   return result({error:"method_not_allowed"},405,origin);
  try{
   if(request.method==="POST"){
    if(!/^text\/plain(?:\s*;|\s*$)/i.test(request.headers.get("Content-Type")||""))
     return result({error:"invalid_content_type"},415,origin);
    if(Number(request.headers.get("Content-Length")||0)>160)
     return result({error:"oversized_event"},413,origin);
    const raw=await request.text();
    if(raw.length>160)return result({error:"oversized_event"},413,origin);
    let body;
    try{body=JSON.parse(raw);}catch{return result({error:"invalid_json"},400,origin);}
    if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).sort().join(",")!=="event,page"||
      !VALID_EVENTS.has(body.event)||!VALID_PAGES.has(body.page))
     return result({error:"invalid_event"},400,origin);
    // Only two fixed strings from the user reach the database; no other fields
    // are accepted. The increment is atomic for simultaneous visitors.
    await query("rpc/mapkepp_count_site_event","POST",{p_page:body.page,p_event:body.event});
   }
   const rows=await query("mapkepp_site_metrics?select=page,visits,uses","GET");
   return result(summarize(rows),200,origin);
  }catch{
   return result({error:"metrics_unavailable"},503,origin);
  }
 }
};