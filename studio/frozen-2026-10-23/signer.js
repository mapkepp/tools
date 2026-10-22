"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const ENDPOINT="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/shortcut-sign";
 const page=location.pathname.replace(/\/index\.html$/,"/").endsWith("/studio/")?"studio":"home";
 const button=$("downloadSign"), panel=$("signedReady"),download=$("signedDownload"),share=$("shareSigned");
 const logBox=$("signDiagnosticLog"), logHeader=$("signLogSummary");
 const allowed=new Set(["click","consent_ok","generate_begin","generate_ok","placeholder_ok","request_begin","headers_ok","response_read","aea1_ok","ready","download_click","share_begin","share_ok","share_cancel","failure"]);
 let signed=null,downloadURL="",trace="",started=0,events=[],session=0,pendingTelemetry=false;
 if(!button || !panel || !download || !share || !logBox)return;
 function errorCode(e){
   if(e?.name==="AbortError")return "timeout";
   if(e?.name==="TypeError")return "network_error";
   if(e?.code && /^[a-z0-9_]{1,40}$/.test(e.code))return e.code;
   return "signing_failed";
 }
 function log(stage,extra={}){
   if(!allowed.has(stage))return;
   const ms=Math.max(0,Math.min(300000,Math.floor(performance.now()-started)));
   const event={stage,ms};
   if(Number.isSafeInteger(extra.bytes)&&extra.bytes>=0&&extra.bytes<=1000000)event.bytes=extra.bytes;
   if(Number.isInteger(extra.http)&&extra.http>=100&&extra.http<=599)event.http=extra.http;
   if(typeof extra.code==="string"&&/^[a-z0-9_]{1,40}$/.test(extra.code))event.code=extra.code;
   events.push(event);
   const timestamp=new Date().toISOString().slice(11,23)+"Z";
   const fields=[page,trace,stage,"+"+ms+"ms"];
   if(event.bytes!==undefined)fields.push("bytes="+event.bytes);
   if(event.http!==undefined)fields.push("http="+event.http);
   if(event.code)fields.push("reason="+event.code);
   logBox.textContent+=(logBox.textContent?"\n":"")+timestamp+" | "+fields.join(" | ");
   logBox.scrollTop=logBox.scrollHeight;
 }
 async function flushLog(){
   if(pendingTelemetry||!trace||!events.length)return;
   pendingTelemetry=true;
   const batch=events.splice(0,40);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{
     await fetch(ENDPOINT,{method:"POST",mode:"cors",credentials:"omit",redirect:"error",
       cache:"no-store",referrerPolicy:"no-referrer",keepalive:true,
       headers:{"Content-Type":"text/plain;charset=UTF-8"},
       body:JSON.stringify({operation:"sign_trace",page,trace,events:batch}),signal:controller.signal});
   }catch{/* Only safe local logging remains if telemetry connection fails. */}
   finally{clearTimeout(timer);pendingTelemetry=false;}
 }
 function reset(){
   signed=null;panel.hidden=true;
   if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL="";}
 }
 function show(message,bad=false){
   window.MapkeppStudio?.showStatus(message,bad);
   if(bad)panel.hidden=true;
 }
 button.addEventListener("click",async event=>{
   // Old frozen homepage registered a form-submit handler. Prevent it from
   // running; our verified relay replaces it, on BOTH versions of the site.
   event.stopImmediatePropagation();
   event.preventDefault();
   if(button.disabled)return;
   session++;
   started=performance.now();
   trace=crypto.randomUUID();
   events=[];
   logBox.textContent="";
   if(logHeader)logHeader.textContent="Страница: "+page+" · запрос: "+trace;
   $("signDiagnostics").open=true;
   log("click");
   try{
     if(!$("signConsent").checked){
       const e=new Error("Разрешите передачу шаблона без токена через Supabase в Shortcuty.");
       e.code="consent_missing";throw e;
     }
     log("consent_ok");
     log("generate_begin");
     const unsigned=window.MapkeppStudio.createUnsigned();
     if(!(unsigned instanceof File)||unsigned.size<200||unsigned.size>100000){
       const e=new Error("Сформированный шаблон неправильного размера.");e.code="bad_source_size";throw e;
     }
     log("generate_ok",{bytes:unsigned.size});
     const xml=await unsigned.text();
     if(!xml.includes("YANDEX_OAUTH_TOKEN") || /<string>y0__/.test(xml)){
       const e=new Error("В шаблоне отсутствует безопасный плейсхолдер.");e.code="unsafe_template";throw e;
     }
     log("placeholder_ok");
     button.disabled=true;button.textContent="⏳ Подписываем…";
     reset();
     const form=new FormData();
     form.append("file",unsigned,unsigned.name);
     form.append("page",page);
     form.append("trace",trace);
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
     let response,body;
     try{
       log("request_begin",{bytes:unsigned.size});
       response=await fetch(ENDPOINT,{method:"POST",mode:"cors",credentials:"omit",
         redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",
         body:form,signal:controller.signal});
       log("headers_ok",{http:response.status});
       if(response.ok)body=await response.arrayBuffer();
       else{
         const errorBody=await response.json().catch(()=>({}));
         const err=new Error("Ошибка сервера подписи: "+(errorBody.error||"HTTP "+response.status));
         err.code=/^[a-z0-9_]{1,40}$/.test(errorBody.error||"")?errorBody.error:"sign_http_error";
         throw err;
       }
     }finally{clearTimeout(timer);}
     log("response_read",{bytes:body.byteLength});
     if(body.byteLength<8||body.byteLength>1000000||
       String.fromCharCode(...new Uint8Array(body.slice(0,4)))!=="AEA1"){
       const e=new Error("Ответ сервера не является подписанным Apple AEA1.");e.code="bad_aea1";throw e;
     }
     log("aea1_ok",{bytes:body.byteLength});
     const name=unsigned.name.replace(/\.shortcut$/i,"")+" — Signed.shortcut";
     signed=new File([body],name,{type:"application/octet-stream"});
     downloadURL=URL.createObjectURL(signed);
     download.href=downloadURL;download.download=name;
     panel.hidden=false;
     share.hidden=!(navigator.canShare && navigator.canShare({files:[signed]}));
     log("ready");
     show("Подпись подтверждена. Нажмите «Сохранить подписанную команду», затем откройте файл из «Загрузок» Safari.");
   }catch(e){
     const code=errorCode(e);
     log("failure",{code});
     show(e?.name==="AbortError"?"Превышено время ожидания подписи: смотрите журнал.":e.message||String(e),true);
   }finally{
     button.disabled=false;button.textContent="📥 Подписать и скачать";
     void flushLog();
   }
 },true);
 download.addEventListener("click",()=>{if(signed){log("download_click",{bytes:signed.size});void flushLog();}});
 share.addEventListener("click",async()=>{
   if(!signed)return;
   log("share_begin",{bytes:signed.size});
   try{
     await navigator.share({files:[signed],title:"Подписанная Apple Команда"});
     log("share_ok");
   }catch(e){
     log("share_cancel",{code:e?.name==="AbortError"?"cancelled":"share_failed"});
     if(e?.name!=="AbortError")show("Откройте файл через Safari «Загрузки» или «Файлы».",true);
   }finally{void flushLog();}
 });
 $("copySignDiagnostics")?.addEventListener("click",async()=>{
   try{await navigator.clipboard.writeText(logBox.textContent);show("Диагностика подписи скопирована. Токены и названия устройств не записываются.");}
   catch{show("Выделите текст в журнале вручную: копирование недоступно.",true);}
 });
 window.addEventListener("pagehide",()=>{if(downloadURL)URL.revokeObjectURL(downloadURL);});
})();