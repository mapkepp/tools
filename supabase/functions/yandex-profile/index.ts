// Read-only Yandex ID profile, using the calling user's OAuth token.
// No token or user information is saved or logged. CORS limited to Mapkepp Tools.
const ORIGIN="https://mapkepp.github.io";
const response=(data,status,allowed=false)=>new Response(JSON.stringify(data),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "referrer-policy":"no-referrer","x-content-type-options":"nosniff",
  "vary":"Origin",...(allowed?{"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"Content-Type"}:{})
}});
Deno.serve(async request=>{
 const permitted=request.headers.get("origin")===ORIGIN;
 if(!permitted)return response({error:"origin_not_allowed"},403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
   "access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST, OPTIONS",
   "access-control-allow-headers":"Content-Type","cache-control":"no-store"
 }});
 if(request.method!=="POST")return response({error:"method_not_allowed"},405,true);
 if(!(request.headers.get("content-type")||"").startsWith("application/json"))return response({error:"invalid_content_type"},415,true);
 if(Number(request.headers.get("content-length")||0)>8192)return response({error:"too_large"},413,true);
 let payload;
 try{const body=await request.text();if(body.length>8192)throw Error();payload=JSON.parse(body);}
 catch{return response({error:"invalid_json"},400,true);}
 const token=payload?.access_token;
 if(typeof token!=="string"||token.length<12||token.length>4096||!/^[A-Za-z0-9_.~+\/=-]+$/.test(token))
   return response({error:"invalid_token"},400,true);
 let upstream;
 try{upstream=await fetch("https://login.yandex.ru/info",{headers:{Authorization:"OAuth "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000),cache:"no-store"});}
 catch{return response({error:"profile_unavailable"},502,true);}
 if(upstream.status===401||upstream.status===403)return response({error:"profile_not_authorized"},401,true);
 if(!upstream.ok)return response({error:"profile_unavailable"},502,true);
 let data;
 try{data=await upstream.json();}catch{return response({error:"invalid_profile"},502,true);}
 const str=value=>typeof value==="string"?value.slice(0,150):"";
 const avatar=typeof data.default_avatar_id==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(data.default_avatar_id)?data.default_avatar_id:"";
 if(!str(data.login))return response({error:"profile_not_permitted"},403,true);
 return response({login:str(data.login),display_name:str(data.display_name),real_name:str(data.real_name),first_name:str(data.first_name),is_avatar_empty:data.is_avatar_empty!==false,avatar_id:avatar},200,true);
});