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


/*
 * Public Studio needs only identity, hierarchy, supported capabilities and
 * numeric action bounds. Drop verbose API properties, aliases, manufacturer
 * metadata and per-capability timestamps before crossing the browser edge.
 * IDs/names are still sent solely to the requesting browser, never logged.
 */
const studioCapability = (cap) => {
  if (!cap || typeof cap.type !== "string") return null;
  const type=cap.type, p=cap.parameters||{}, state=cap.state||{};
  const allowed=[
    "devices.capabilities.on_off",
    "devices.capabilities.range",
    "devices.capabilities.mode",
    "devices.capabilities.color_setting"
  ];
  if(!allowed.includes(type))return null;
  const parameters={};
  if(type==="devices.capabilities.range" && typeof p.instance==="string"){
    parameters.instance=p.instance;
    if(p.range && Number.isFinite(p.range.min) && Number.isFinite(p.range.max)){
      parameters.range={min:p.range.min,max:p.range.max};
      if(Number.isFinite(p.range.precision))parameters.range.precision=p.range.precision;
    }
  }
  if(type==="devices.capabilities.mode" && typeof p.instance==="string"){
    parameters.instance=p.instance;
    if(Array.isArray(p.modes))parameters.modes=p.modes
      .filter(m=>m && typeof m.value==="string")
      .map(m=>({value:m.value}));
  }
  if(type==="devices.capabilities.color_setting" && p.temperature_k){
    const t=p.temperature_k;
    if(Number.isFinite(t.min)&&Number.isFinite(t.max)){
      parameters.temperature_k={min:t.min,max:t.max};
      if(Number.isFinite(t.precision))parameters.temperature_k.precision=t.precision;
    }
  }
  const out={type,parameters};
  if(typeof state.value==="number" && Number.isFinite(state.value))out.state={value:state.value};
  return out;
};
const slimStudioHome = home => {
  const identity=x=>({id:x.id,name:x.name});
  const linkage=x=>({
    ...identity(x),
    ...(typeof x.household_id==="string"?{household_id:x.household_id}:{})
  });
  const capabilities=x=>Array.isArray(x.capabilities)
    ?x.capabilities.map(studioCapability).filter(Boolean):[];
  return {
    status:"ok",
    households:home.households.map(identity),
    rooms:home.rooms.map(x=>({
      ...linkage(x),
      devices:Array.isArray(x.devices)?x.devices.filter(id=>typeof id==="string"):[]
    })),
    devices:home.devices.map(x=>({
      ...linkage(x),
      ...(typeof x.room==="string"?{room:x.room}:{}),
      ...(typeof x.type==="string"?{type:x.type}:{}),
      capabilities:capabilities(x)
    })),
    groups:home.groups.map(x=>({
      ...linkage(x),
      ...(typeof x.type==="string"?{type:x.type}:{}),
      devices:Array.isArray(x.devices)?x.devices.filter(id=>typeof id==="string"):[],
      capabilities:capabilities(x)
    })),
    scenarios:home.scenarios.map(x=>({
      ...identity(x),
      is_active:x.is_active!==false
    }))
  };
};

const json = (data, status, origin, metrics=null) => {
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
    headers["Access-Control-Expose-Headers"] = "X-Mapkepp-Body-Bytes, X-Mapkepp-Upstream-Ms";
  }
  const payload=JSON.stringify(data);
  if(metrics && status===200){
    headers["X-Mapkepp-Body-Bytes"]=String(new TextEncoder().encode(payload).byteLength);
    headers["X-Mapkepp-Upstream-Ms"]=String(metrics.upstreamMs);
  }
  return new Response(payload, {status, headers});
};
// Error telemetry is private. Intentionally excludes IP, user agent, token,
 // request/response bodies, user names, request IDs and device IDs.
const diagnostic = async (code, status, origin, upstreamStatus=null) => {
  if (typeof Deno !== "undefined" && Deno.env && typeof Deno.env.get === "function") {
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(supabaseUrl && serviceKey) {
      try {
        await fetch(supabaseUrl+"/rest/v1/internal_error_events",{
          method:"POST",headers:{
            apikey:serviceKey,Authorization:"Bearer "+serviceKey,
            "Content-Type":"application/json","Prefer":"return=minimal"
          },
          body:JSON.stringify({
            source:"yandex-home",
            code,
            upstream_status:upstreamStatus
          }),
          signal:AbortSignal.timeout(2200),
          cache:"no-store",
          redirect:"error"
        });
      }catch{
        // Deliberately do not log exceptions or user-related request data.
      }
    }
  }
  return json({error:code,...(upstreamStatus?{upstream_status:upstreamStatus}:{})},status,origin);
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
    const upstreamStart=performance.now();
    let upstream;
    try{
      upstream=await fetch(TARGET,{method:"GET",headers:{
        Authorization:"Bearer "+token,
        Accept:"application/json"
      },signal:AbortSignal.timeout(15000),cache:"no-store",redirect:"error"});
    }catch(e){
      return diagnostic(e?.name==="TimeoutError"?"yandex_timeout":"yandex_unavailable",502,origin);
    }
    if(upstream.status===401||upstream.status===403) return diagnostic("unauthorized",401,origin,upstream.status);
    if(!upstream.ok) return diagnostic("yandex_error",502,origin,upstream.status);
    const bytes=Number(upstream.headers.get("content-length")||0);
    if(bytes>RESPONSE_LIMIT)return diagnostic("response_too_large",502,origin);
    let body;
    try{body=await upstream.text();}catch{return diagnostic("yandex_read_failed",502,origin);}
    if(body.length>RESPONSE_LIMIT)return diagnostic("response_too_large",502,origin);
    let home;
    try{home=JSON.parse(body);}catch{return diagnostic("invalid_yandex_json",502,origin);}
    if(home?.status!=="ok" || !Array.isArray(home?.households)||!Array.isArray(home?.rooms)||!Array.isArray(home?.devices)||!Array.isArray(home?.groups)||!Array.isArray(home?.scenarios)){
      return diagnostic("unexpected_yandex_response",502,origin);
    }
    const upstreamMs=Math.round(performance.now()-upstreamStart);
    const compact=slimStudioHome(home);
    const originalBytes=new TextEncoder().encode(body).byteLength;
    const replyBytes=new TextEncoder().encode(JSON.stringify(compact)).byteLength;
    // Numeric transport metrics only; no tokens, names, ID values or device content.
    console.info("mapkepp-home transport "+JSON.stringify({result:"ready",http_status:200,source_bytes:originalBytes,reply_bytes:replyBytes,upstream_ms:upstreamMs}));
    return json(compact,200,origin,{upstreamMs});
  }
};
