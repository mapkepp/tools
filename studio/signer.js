"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const ENDPOINT="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/shortcut-sign";
 const button=$("downloadSign"), panel=$("signedReady"),download=$("signedDownload"),share=$("shareSigned");
 let signed=null,downloadURL="";
 function show(message,bad=false){window.MapkeppStudio?.showStatus(message,bad);if(bad)panel.hidden=true;}
 function reset(){
  signed=null;panel.hidden=true;
  if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL="";}
 }
 button.addEventListener("click",async()=>{
  try{
   if(!$("signConsent").checked)throw Error("Сначала разрешите передать шаблон без токена на подпись Shortcuty.");
   if(button.disabled)return;
   const unsigned=window.MapkeppStudio.createUnsigned();
   const text=await unsigned.text();
   if(!text.includes("YANDEX_OAUTH_TOKEN"))throw Error("Подписание со встроенным токеном здесь запрещено.");
   button.disabled=true;button.textContent="⏳ Подписываем…";
   reset();
   const form=new FormData();
   form.append("file",unsigned,unsigned.name);
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),35000);
   let response,body;
   try{
    response=await fetch(ENDPOINT,{method:"POST",mode:"cors",credentials:"omit",
     redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",body:form,signal:controller.signal});
    if(response.ok)body=await response.arrayBuffer();
    else{
     const err=await response.json().catch(()=>({}));
     const message=err.error==="signer_unavailable"||err.error==="signer_timeout"
       ?"Внешний сервис подписи временно недоступен."
       :err.error==="signer_rejected"
       ?"Shortcuty отклонил формат команды (HTTP "+(err.upstream_status||response.status)+")."
       :"Сервер не смог подписать файл (HTTP "+response.status+").";
     throw Error(message);
    }
   }finally{clearTimeout(timer);}
   if(body.byteLength<8||body.byteLength>1000000)throw Error("Получен файл неподходящего размера.");
   const head=String.fromCharCode(...new Uint8Array(body.slice(0,4)));
   if(head!=="AEA1")throw Error("Файл не содержит подпись Apple AEA1.");
   const name=unsigned.name.replace(/\.shortcut$/i,"")+" — Signed.shortcut";
   signed=new File([body],name,{type:"application/octet-stream"});
   downloadURL=URL.createObjectURL(signed);
   download.href=downloadURL;download.download=name;
   panel.hidden=false;
   share.hidden=!(navigator.canShare&&navigator.canShare({files:[signed]}));
   show("Команда подписана (AEA1). Сохраните файл ниже или откройте меню «Поделиться» на iPhone.");
  }catch(e){
   show(e?.name==="AbortError"?"Время ожидания подписи истекло. Повторите позже.":e.message||String(e),true);
  }finally{button.disabled=false;button.textContent="📥 Подписать и скачать";}
 });
 share.addEventListener("click",async()=>{
  if(!signed)return;
  try{await navigator.share({files:[signed],title:"Подписанная Apple Команда"});}
  catch(e){if(e?.name!=="AbortError")show("Не удалось открыть меню «Поделиться». Используйте кнопку сохранения файла.",true);}
 });
 window.addEventListener("pagehide",()=>{if(downloadURL)URL.revokeObjectURL(downloadURL);});
})();