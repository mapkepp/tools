import {chromium} from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 const page=await browser.newPage();
 await page.goto("https://mapkepp.github.io/tools/studio/?signed-handoff-direct-test=1",{waitUntil:"domcontentloaded"});
 await page.locator("#demoButton").click();
 await page.locator("button.item[data-id='l1']").click();
 const result=await page.evaluate(async()=>{
   const f=window.MapkeppStudio.createUnsigned();
   const form=new FormData();form.append("file",f,f.name);
   form.append("page","studio");form.append("trace",crypto.randomUUID());form.append("mode","prepare");
   const url="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/shortcut-sign";
   const start=performance.now();
   const response=await fetch(url,{method:"POST",body:form,cache:"no-store"});
   const handoff=await response.json();
   if(!response.ok)return {stage:"prepare",http:response.status,error:handoff.error};
   const chunks=[];
   for(let index=0;index<handoff.chunks;index++){
     const r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({operation:"get_signed_chunk",id:handoff.id,index,page:"studio",trace:crypto.randomUUID()})});
     const chunk=await r.json();
     if(!r.ok)return {stage:"chunk",index,http:r.status,error:chunk.error};
     chunks.push(chunk.fragment);
   }
   const from64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
   const key=await crypto.subtle.importKey("raw",from64(handoff.key),"AES-GCM",false,["decrypt"]);
   const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:from64(handoff.iv)},key,from64(chunks.join("")));
   const bytes=new Uint8Array(plain);
   const sha=new Uint8Array(await crypto.subtle.digest("SHA-256",plain));
   const hash=Array.from(sha,b=>b.toString(16).padStart(2,"0")).join("");
   const released=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({operation:"release_signed_transfer",id:handoff.id,page:"studio",trace:crypto.randomUUID()})});
   return {stage:"done",chars:bytes.byteLength,parts:handoff.chunks,hashOk:hash===handoff.digest,
     prefix:String.fromCharCode(...bytes.slice(0,4)),releaseStatus:released.status,
     elapsedMs:Math.round(performance.now()-start)};
 });
 console.log("Encrypted handoff summary (no tokens or devices):",JSON.stringify(result));
 assert.equal(result.stage,"done");
 assert.equal(result.prefix,"AEA1");
 assert.equal(result.hashOk,true);
 assert.ok(result.parts>2);
 assert.equal(result.releaseStatus,200);
}finally{await browser.close();}
