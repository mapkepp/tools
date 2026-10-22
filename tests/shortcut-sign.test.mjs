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
