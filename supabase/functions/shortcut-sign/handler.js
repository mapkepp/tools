// Stateless token-free Apple Shortcut signing relay.
// Authorized site only. Never persist or log a Shortcut or its content.
const ORIGIN="https://mapkepp.github.io";
const SIGNER="https://sign.shortcuty.app/api/v1/sign?response=json";
const cors=(origin)=>origin===ORIGIN?{
 "Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600",
 "Access-Control-Expose-Headers":"X-Mapkepp-Signed-Bytes","Vary":"Origin"
}:{"Vary":"Origin"};
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
  if(!type.toLowerCase().startsWith("multipart/form-data"))
   return reply({error:"invalid_content_type"},415,origin);
  if(Number(req.headers.get("content-length")||0)>120000)
   return reply({error:"request_too_large"},413,origin);
  let form;
  try{form=await req.formData();}catch{return reply({error:"invalid_form"},400,origin);}
  const f=form.get("file");
  if(!(f instanceof File)||f.size<200||f.size>100000)
   return reply({error:"invalid_shortcut_size"},400,origin);
  const bytes=await f.arrayBuffer();
  const text=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  if(!text.startsWith("<?xml")||!text.includes("<plist")||
    !text.includes("WFWorkflowActions")||!text.includes("YANDEX_OAUTH_TOKEN"))
   return reply({error:"unsafe_or_invalid_shortcut"},422,origin);
  // The server accepts unsigned token-placeholder files ONLY.
  const outbound=new FormData();
  outbound.append("file",new File([bytes],"Mapkepp-Safe.shortcut",{type:"application/octet-stream"}));
  let remote,info;
  const t0=performance.now(),ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),25000);
  try{
   remote=await fetch(SIGNER,{method:"POST",body:outbound,signal:ctl.signal,
    redirect:"error",cache:"no-store"});
   if(!remote.ok)return reply({error:remote.status===503?"signer_unavailable":"signer_rejected",upstream_status:remote.status},502,origin);
   const raw=await remote.text();
   if(raw.length>2000000)return reply({error:"signed_response_too_large"},502,origin);
   info=JSON.parse(raw);
  }catch(error){
   return reply({error:ctl.signal.aborted?"signer_timeout":"signer_unavailable"},502,origin);
  }finally{clearTimeout(timer);}
  const signed=info?.file;
  if(info?.success!==true||typeof signed?.content_base64!=="string"||
     signed.content_base64.length>1800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(signed.content_base64))
   return reply({error:"invalid_signer_response"},502,origin);
  let decoded;
  try{const binary=atob(signed.content_base64);decoded=Uint8Array.from(binary,c=>c.charCodeAt(0));}
  catch{return reply({error:"invalid_signed_payload"},502,origin);}
  if(decoded.byteLength<8||decoded.byteLength>1000000||
     String.fromCharCode(...decoded.slice(0,4))!=="AEA1")
   return reply({error:"invalid_signed_format"},502,origin);
  const [sourceHash,signedHash]=await Promise.all([digest(bytes),digest(decoded)]);
  if(signed.input_sha256 && signed.input_sha256!==sourceHash)
   return reply({error:"source_hash_mismatch"},502,origin);
  if(signed.signed_sha256 && signed.signed_sha256!==signedHash)
   return reply({error:"signed_hash_mismatch"},502,origin);
  console.info("mapkepp-sign result "+JSON.stringify({status:"ok",input_bytes:bytes.byteLength,
   signed_bytes:decoded.byteLength,upstream_ms:Math.round(performance.now()-t0)}));
  return new Response(decoded,{status:200,headers:{
   ...cors(origin),"Content-Type":"application/octet-stream",
   "Content-Disposition":"attachment; filename=\"Mapkepp-Signed.shortcut\"",
   "X-Mapkepp-Signed-Bytes":String(decoded.byteLength),
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer"
  }});
 }
};