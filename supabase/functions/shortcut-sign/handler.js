// Stateless token-free Apple Shortcut signing relay.
// Authorized site only. Never persist or log a Shortcut or its content.
const ORIGIN="https://mapkepp.github.io";
const SIGNER="https://sign.shortcuty.app/api/v1/sign?response=json";
const cors=(origin)=>origin===ORIGIN?{
 "Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600",
 "Access-Control-Expose-Headers":"X-Mapkepp-Signed-Bytes","Vary":"Origin"
}:{"Vary":"Origin"};
const PAGE_SET=new Set(["home","studio"]);
const EVENT_SET=new Set(["click","consent_ok","generate_begin","generate_ok","placeholder_ok","request_begin","headers_ok","response_read","aea1_ok","ready","download_click","share_begin","share_ok","share_cancel","failure"]);
const cleanPage=x=>PAGE_SET.has(x)?x:"unknown";
const cleanTrace=x=>typeof x==="string" && /^[a-f0-9-]{36}$/.test(x)?x:"none";
const traceEvent=(page,trace,stage,extra={})=>{
 const safe={page:cleanPage(page),trace:cleanTrace(trace),stage,...extra};
 console.info("mapkepp-sign-stage "+JSON.stringify(safe));
};
const reply=(data,status,origin)=>new Response(JSON.stringify(data),{
 status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const digest=async bytes=>toHex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
export default {
 async fetch(req){
  const origin=req.headers.get("origin")||"";
  if(origin!==ORIGIN)return reply({error:"origin_not_allowed"},403,origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405,origin);
  const type=req.headers.get("content-type")||"";
  if(/^text\/plain(?:\s*;|\s*$)/i.test(type)){
    let body;
    try{body=await req.text();if(body.length>5000)throw Error("oversize");}
    catch{return reply({error:"invalid_trace"},400,origin);}
    let payload;
    try{payload=JSON.parse(body);}catch{return reply({error:"invalid_trace"},400,origin);}
    if(payload?.operation!=="sign_trace"||!PAGE_SET.has(payload.page)||
       cleanTrace(payload.trace)==="none"||
       !Array.isArray(payload.events)||payload.events.length<1||payload.events.length>40)
      return reply({error:"invalid_trace"},400,origin);
    const stages=[];
    for(const e of payload.events){
      if(!e||!EVENT_SET.has(e.stage)||!Number.isSafeInteger(e.ms)||e.ms<0||e.ms>300000||
         (e.bytes!==undefined&&(!Number.isSafeInteger(e.bytes)||e.bytes<0||e.bytes>1000000))||
         (e.http!==undefined&&(!Number.isInteger(e.http)||e.http<100||e.http>599)) ||
         (e.code!==undefined&&(!/^[a-z0-9_]{1,40}$/.test(e.code))))
        return reply({error:"invalid_trace"},400,origin);
      stages.push({stage:e.stage,ms:e.ms,
        ...(e.bytes!==undefined?{bytes:e.bytes}:{}),
        ...(e.http!==undefined?{http:e.http}:{}),
        ...(e.code!==undefined?{code:e.code}:{})});
    }
    for(const event of stages){
      const {stage,...details}=event;
      traceEvent(payload.page,payload.trace,"browser_"+stage,details);
    }
    return reply({ok:true,accepted:stages.length},200,origin);
  }
  if(!type.toLowerCase().startsWith("multipart/form-data"))
   return reply({error:"invalid_content_type"},415,origin);
  const started=performance.now();
  let page="unknown",trace="none",stage="receive";
  const ms=()=>Math.round(performance.now()-started);
  const step=(name,extra={})=>{stage=name;traceEvent(page,trace,name,{ms:ms(),...extra});};
  const fail=(code,status,extra={})=>{
    step("failure",{code,http:status});
    return reply({error:code,...extra},status,origin);
  };
  if(Number(req.headers.get("content-length")||0)>120000)
   return fail("request_too_large",413);
  let form;
  try{form=await req.formData();}catch{return fail("invalid_form",400);}
  page=cleanPage(form.get("page"));trace=cleanTrace(form.get("trace"));
  step("request_received");
  step("multipart_decoded");
  const f=form.get("file");
  if(!(f instanceof File)||f.size<200||f.size>100000)
   return fail("invalid_shortcut_size",400);
  step("file_received",{bytes:f.size});
  let bytes,text;
  try{
    bytes=await f.arrayBuffer();
    text=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  }catch{return fail("file_read_failed",400);}
  if(!text.startsWith("<?xml")||!text.includes("<plist")||
    !text.includes("WFWorkflowActions")||!text.includes("YANDEX_OAUTH_TOKEN"))
   return fail("unsafe_or_invalid_shortcut",422);
  step("placeholder_validated",{bytes:bytes.byteLength});
  const outbound=new FormData();
  outbound.append("file",new File([bytes],"Mapkepp-Safe.shortcut",{type:"application/octet-stream"}));
  let remote,info;
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),25000);
  try{
   step("signer_request");
   remote=await fetch(SIGNER,{method:"POST",body:outbound,signal:ctl.signal,
    redirect:"error",cache:"no-store"});
   step("signer_headers",{http:remote.status});
   if(!remote.ok)return fail(remote.status===503?"signer_unavailable":"signer_rejected",502,{upstream_status:remote.status});
   const raw=await remote.text();
   step("signer_body",{bytes:raw.length});
   if(raw.length>2000000)return fail("signed_response_too_large",502);
   info=JSON.parse(raw);
  }catch(error){
   return fail(ctl.signal.aborted?"signer_timeout":"signer_unavailable",502);
  }finally{clearTimeout(timer);}
  const signed=info?.file;
  if(info?.success!==true||typeof signed?.content_base64!=="string"||
     signed.content_base64.length>1800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(signed.content_base64))
   return fail("invalid_signer_response",502);
  step("signer_json_validated");
  let decoded;
  try{const binary=atob(signed.content_base64);decoded=Uint8Array.from(binary,c=>c.charCodeAt(0));}
  catch{return fail("invalid_signed_payload",502);}
  if(decoded.byteLength<8||decoded.byteLength>1000000||
     String.fromCharCode(...decoded.slice(0,4))!=="AEA1")
   return fail("invalid_signed_format",502);
  step("aea1_validated",{bytes:decoded.byteLength});
  const [sourceHash,signedHash]=await Promise.all([digest(bytes),digest(decoded)]);
  if(signed.input_sha256 && signed.input_sha256!==sourceHash)
   return fail("source_hash_mismatch",502);
  if(signed.signed_sha256 && signed.signed_sha256!==signedHash)
   return fail("signed_hash_mismatch",502);
  step("hash_validated");
  step("response_sent",{bytes:decoded.byteLength,http:200});
  return new Response(decoded,{status:200,headers:{
   ...cors(origin),"Content-Type":"application/octet-stream",
   "Content-Disposition":"attachment; filename=\"Mapkepp-Signed.shortcut\"",
   "X-Mapkepp-Signed-Bytes":String(decoded.byteLength),
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer"
  }});
 }
};
