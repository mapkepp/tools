/**
 * Mapkepp Tools — read-only Yandex Smart Home discovery proxy.
 * Deploy as a Vercel Function at /api/yandex-home.
 * No credentials or OAuth client secret are stored. User tokens are received
 * only for the duration of this request, forwarded to the fixed Yandex API,
 * never persisted, logged, cached or returned.
 */
const ALLOWED_ORIGINS = new Set(["https://mapkepp.github.io"]);
const TARGET = "https://api.iot.yandex.net/v1.0/user/info";
const SIZE_LIMIT = 2_000_000;
const RESPONSE_LIMIT = 2_500_000;

const json = (data, status, origin) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return new Response(JSON.stringify(data), {status, headers});
};
export default {
  async fetch(request) {
    const origin = request.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Max-Age":"600",
      "Cache-Control":"no-store",
      "Vary":"Origin"
    }});
    if (request.method !== "POST") return json({error:"method_not_allowed"},405,origin);
    const type = request.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("application/json")) return json({error:"invalid_content_type"},415,origin);
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > 8192) return json({error:"request_too_large"},413,origin);
    let text;
    try {text = await request.text();}catch{return json({error:"request_read_failed"},400,origin);}
    if (text.length > 8192) return json({error:"request_too_large"},413,origin);
    let data;
    try{data=JSON.parse(text);}catch{return json({error:"invalid_json"},400,origin);}
    const token=data?.access_token;
    if(typeof token!=="string" || token.length<12 || token.length>4096 || !/^[A-Za-z0-9_~.\-+/=]+$/.test(token)){
      return json({error:"invalid_token_format"},400,origin);
    }
    let upstream;
    try{
      upstream=await fetch(TARGET,{method:"GET",headers:{
        Authorization:"Bearer "+token,
        Accept:"application/json"
      },signal:AbortSignal.timeout(15000),cache:"no-store",redirect:"error"});
    }catch(e){
      return json({error:e?.name==="TimeoutError"?"yandex_timeout":"yandex_unavailable"},502,origin);
    }
    if(upstream.status===401||upstream.status===403) return json({error:"unauthorized",upstream_status:upstream.status},401,origin);
    if(!upstream.ok) return json({error:"yandex_error",upstream_status:upstream.status},502,origin);
    const bytes=Number(upstream.headers.get("content-length")||0);
    if(bytes>RESPONSE_LIMIT)return json({error:"response_too_large"},502,origin);
    let body;
    try{body=await upstream.text();}catch{return json({error:"yandex_read_failed"},502,origin);}
    if(body.length>RESPONSE_LIMIT)return json({error:"response_too_large"},502,origin);
    let home;
    try{home=JSON.parse(body);}catch{return json({error:"invalid_yandex_json"},502,origin);}
    if(home?.status!=="ok" || !Array.isArray(home?.households)||!Array.isArray(home?.rooms)||!Array.isArray(home?.devices)||!Array.isArray(home?.groups)||!Array.isArray(home?.scenarios)){
      return json({error:"unexpected_yandex_response"},502,origin);
    }
    // Only the Yandex incident request ID is logged, never the token or home.
    if(typeof home.request_id==="string") console.info("Yandex Smart Home request_id",home.request_id);
    return json(home,200,origin);
  }
};
