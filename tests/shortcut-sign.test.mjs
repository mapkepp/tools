import test from "node:test";
import assert from "node:assert/strict";
import handler from "../supabase/functions/shortcut-sign/handler.js";

const ORIGIN="https://mapkepp.github.io";
const input='<?xml version="1.0" encoding="UTF-8"?><plist><dict><key>WFWorkflowActions</key><array><string>YANDEX_OAUTH_TOKEN</string></array></dict></plist>'+" ".repeat(250);
const body=(s=input)=>{
 const form=new FormData();
 form.append("file",new File([s],"test.shortcut",{type:"application/octet-stream"}));
 return form;
};
const request=(origin=ORIGIN,value=input)=>new Request("https://sign.invalid/",{
 method:"POST",headers:{Origin:origin},body:body(value)
});
test("reject non-site origins and unsigned forms without token placeholder",async()=>{
 assert.equal((await handler.fetch(request("https://attacker.invalid"))).status,403);
 assert.equal((await handler.fetch(request(ORIGIN,input.replace("YANDEX_OAUTH_TOKEN","ACTUAL_SECRET_TOKEN")))).status,422);
 const noFile=new Request("https://sign.invalid/",{method:"POST",headers:{Origin:ORIGIN},body:new FormData()});
 assert.equal((await handler.fetch(noFile)).status,400);
});
test("signing relay returns validated Apple AEA1 only and never logs shortcut contents",async()=>{
 const oldFetch=globalThis.fetch;
 const signed=new TextEncoder().encode("AEA1-synthetic-signed-file");
 let inspected=false;
 try{
 globalThis.fetch=async(url,init)=>{
   assert.match(url,/sign\.shortcuty\.app\/api\/v1\/sign\?response=json/);
   const sent=init.body.get("file");
   assert.ok(sent instanceof File);
   assert.match(await sent.text(),/YANDEX_OAUTH_TOKEN/);
   const sourceHash=Buffer.from(await crypto.subtle.digest("SHA-256",await sent.arrayBuffer())).toString("hex");
   const signedHash=Buffer.from(await crypto.subtle.digest("SHA-256",signed)).toString("hex");
   inspected=true;
   return new Response(JSON.stringify({success:true,file:{
     content_base64:Buffer.from(signed).toString("base64"),
     input_sha256:sourceHash,signed_sha256:signedHash
   }}),{status:200,headers:{"content-type":"application/json"}});
 };
 const result=await handler.fetch(request());
 assert.equal(result.status,200);
 assert.equal(result.headers.get("access-control-allow-origin"),ORIGIN);
 assert.equal(result.headers.get("cache-control"),"no-store");
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),signed);
 assert.equal(inspected,true);
 }finally{globalThis.fetch=oldFetch;}
});
test("reject invalid signature and broken hashes from upstream",async()=>{
 const oldFetch=globalThis.fetch;
 try{
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,file:{
   content_base64:Buffer.from("NOT_SIGNED").toString("base64"),
   input_sha256:"f".repeat(64)
 }}),{status:200});
 const result=await handler.fetch(request());
 assert.equal(result.status,502);
 assert.equal((await result.json()).error,"invalid_signed_format");
 }finally{globalThis.fetch=oldFetch;}
});

test("diagnostics identify home/studio, stage and trace but redact arbitrary private fields",async()=>{
 const previous=console.info,lines=[];
 console.info=(message)=>lines.push(String(message));
 try{
   for(const page of ["home","studio"]){
     const body={operation:"sign_trace",page,trace:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",events:[
       {stage:"click",ms:0,secret:"DONOTLOG-OAUTH"},
       {stage:"failure",ms:1200,code:"network_error",secret:"DONOTLOG-OAUTH"}
     ]};
     const response=await handler.fetch(new Request("https://sign.invalid",{
       method:"POST",headers:{Origin:ORIGIN,"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify(body)}));
     assert.equal(response.status,200);
     assert.equal((await response.json()).accepted,2);
   }
   assert.equal(lines.length,4);
   assert.ok(lines.some(line=>line.includes('"page":"home"') && line.includes("browser_click")));
   assert.ok(lines.some(line=>line.includes('"page":"studio"') && line.includes("browser_failure")));
   assert.ok(lines.every(line=>!line.includes("DONOTLOG")));
 }finally{console.info=previous;}
 const invalid=await handler.fetch(new Request("https://sign.invalid",{
   method:"POST",headers:{Origin:ORIGIN,"Content-Type":"text/plain"},
   body:JSON.stringify({operation:"sign_trace",page:"attacker",trace:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",events:[{stage:"click",ms:0}]})
 }));
 assert.equal(invalid.status,400);
});


test("encrypted temporary handoff reassembles real AEA1 bytes without server storing plaintext",async()=>{
 const existingFetch=globalThis.fetch,oldDeno=globalThis.Deno,records=new Map();
 const signed=Buffer.concat([Buffer.from("AEA1"),Buffer.alloc(24000,127)]);
 globalThis.Deno={env:{get(name){
   if(name==="SUPABASE_URL")return "https://internal-synthetic.invalid";
   if(name==="SUPABASE_SERVICE_ROLE_KEY")return "synthetic-server-only-secret";
   return null;
 }}};
 try{
   globalThis.fetch=async(url,opt)=>{
     const u=String(url);
     if(u.includes("sign.shortcuty.app")){
       return new Response(JSON.stringify({success:true,file:{content_base64:signed.toString("base64"),
         input_sha256:Buffer.from(await crypto.subtle.digest("SHA-256",await opt.body.get("file").arrayBuffer())).toString("hex"),
         signed_sha256:Buffer.from(await crypto.subtle.digest("SHA-256",signed)).toString("hex")
       }}),{status:200});
     }
     assert.match(u,/\/rest\/v1\/mapkepp_signed_transfers/);
     assert.equal(opt.headers.apikey,"synthetic-server-only-secret");
     if(opt.method==="POST"){
       const item=JSON.parse(opt.body);
       assert.ok(item.ciphertext.length>25000);
       assert.ok(!item.ciphertext.includes("AEA1"));
       records.set(item.id,item);
       return new Response(JSON.stringify([item]),{status:201});
     }
     const id=new URL(u).searchParams.get("id").slice(3);
     if(opt.method==="DELETE"){records.delete(id);return new Response("[]",{status:200});}
     return new Response(JSON.stringify(records.has(id)?[records.get(id)]:[]),{status:200});
   };
   const multipart=body();
   multipart.set("mode","prepare");
   multipart.set("page","studio");
   multipart.set("trace","aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
   const prepare=await handler.fetch(new Request("https://sign.invalid",{method:"POST",headers:{Origin:ORIGIN},body:multipart}));
   assert.equal(prepare.status,200);
   const handoff=await prepare.json();
   assert.equal(handoff.version,2);
   assert.ok(handoff.chunks>8);
   assert.equal(records.size,1);
   assert.equal(records.get(handoff.id).bytes,signed.length);
   const pieces=[];
   for(let index=0;index<handoff.chunks;index++){
     const next=await handler.fetch(new Request("https://sign.invalid",{method:"POST",
       headers:{Origin:ORIGIN,"Content-Type":"text/plain"},
       body:JSON.stringify({operation:"get_signed_chunk",id:handoff.id,index,page:"studio"})}));
     assert.equal(next.status,200);
     const part=await next.json();
     assert.equal(part.index,index);
     assert.equal(part.total,handoff.chunks);
     assert.ok(part.fragment.length<=1536);
     pieces.push(part.fragment);
   }
   const from64=s=>Uint8Array.from(atob(s),ch=>ch.charCodeAt(0));
   const key=await crypto.subtle.importKey("raw",from64(handoff.key),"AES-GCM",false,["decrypt"]);
   const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:from64(handoff.iv)},key,from64(pieces.join("")));
   assert.deepEqual(Buffer.from(plain),signed);
   assert.equal(Buffer.from(await crypto.subtle.digest("SHA-256",plain)).toString("hex"),handoff.digest);
   const release=await handler.fetch(new Request("https://sign.invalid",{method:"POST",
       headers:{Origin:ORIGIN,"Content-Type":"text/plain"},
       body:JSON.stringify({operation:"release_signed_transfer",id:handoff.id,page:"studio"})}));
   assert.equal(release.status,200);
   assert.equal(records.size,0);
 }finally{globalThis.fetch=existingFetch;globalThis.Deno=oldDeno;}
});
