"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const KEY="latest", DB="mapkepp-offline-inventory-v1";
 const status=$("localInventoryStatus");
 if(!status||!window.MapkeppStudio)return;
 const setMessage=(value,bad=false)=>{status.textContent=value;status.style.color=bad?"#ffc0b3":"";};
 function database(){
   return new Promise((resolve,reject)=>{
     if(!("indexedDB" in window))return reject(Error("Этот браузер не предоставляет IndexedDB."));
     const req=indexedDB.open(DB,1);
     req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("inventory"))req.result.createObjectStore("inventory");};
     req.onsuccess=()=>resolve(req.result);
     req.onerror=()=>reject(Error("Не удалось открыть локальное хранилище браузера."));
     req.onblocked=()=>reject(Error("Хранилище занято другой вкладкой."));
   });
 }
 async function run(kind,action){
   const db=await database();
   try{return await new Promise((resolve,reject)=>{
     const t=db.transaction("inventory",kind);
     const store=t.objectStore("inventory");
     const req=action(store);
     let result;
     req.onsuccess=()=>{result=req.result;};
     req.onerror=()=>reject(Error("Ошибка локального хранилища."));
     t.oncomplete=()=>resolve(result);
     t.onerror=()=>reject(Error("Не удалось сохранить список устройств."));
     t.onabort=()=>reject(Error("Операция с локальными данными отменена."));
   });}finally{db.close();}
 }
 function exportPayload(){
   const inventory=window.MapkeppStudio.getInventory();
   const text=JSON.stringify(inventory,null,2);
   if(text.length>2800000)throw Error("Список превышает лимит 2,8 МБ.");
   return {text,inventory};
 }
 function fmt(entry){
   const date=new Date(entry.saved_at);
   return Number.isNaN(date.getTime())?"Сохранённый перечень":date.toLocaleString("ru-RU")+
     " · "+entry.count+" устройств";
 }
 function download(text){
   const blob=new Blob([text],{type:"application/json;charset=utf-8"});
   const address=URL.createObjectURL(blob);
   const a=document.createElement("a");a.href=address;
   a.download="mapkepp-devices-"+new Date().toISOString().slice(0,10)+".json";
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(address),30000);
 }
 $("exportInventoryFile").addEventListener("click",()=>{
   try{const {text,inventory}=exportPayload();download(text);
     setMessage("JSON с "+inventory.devices.length+" устройствами сохранён как локальный файл. OAuth-токен в экспорт не включён.");}
   catch(e){setMessage(e.message,true);}
 });
 $("saveInventoryBrowser").addEventListener("click",async()=>{
   try{
     const {text,inventory}=exportPayload();
     await run("readwrite",store=>store.put({version:1,json:text,saved_at:new Date().toISOString(),count:inventory.devices.length},KEY));
     setMessage("Локальная копия сохранена только в браузере: "+inventory.devices.length+" устройств. На этой вкладке и при следующем открытии не нужно заново обращаться к серверу.");
   }catch(e){setMessage(e.message,true);}
 });
 async function restore(manual=false){
   try{
     const entry=await run("readonly",store=>store.get(KEY));
     if(!entry){if(manual)setMessage("Локально сохранённого списка пока нет.");return;}
     if(entry.version!==1||typeof entry.json!=="string"||entry.json.length>2800000)throw Error("Сохранённый список повреждён.");
     // An asynchronous IndexedDB read must never overwrite a device list,
     // QR config or demonstration that the user opened after page load.
     if(!manual && window.MapkeppStudio.hasAnyData())return;
     window.MapkeppStudio.restoreInventory(entry.json);
     setMessage("Загружено из браузерной копии ("+fmt(entry)+"). Сеть и API Яндекса не использовались; данные могли устареть.");
   }catch(e){setMessage("Не удалось открыть локальный список: "+e.message,true);}
 }
 $("restoreInventoryBrowser").addEventListener("click",()=>{void restore(true);});
 $("forgetInventoryBrowser").addEventListener("click",async()=>{
   try{await run("readwrite",store=>store.delete(KEY));setMessage("Локальная копия удалена из браузера. Текущий открытый список не изменён.");}
   catch(e){setMessage(e.message,true);}
 });
 // Opt-in cache can auto-restore only on a plain visit, never override a QR,
 // active shared command, OAuth return or already selected device data.
 if(!location.hash.includes("config=")&&new URLSearchParams(location.search).get("oauth")!=="success"
    &&!window.MapkeppStudio.hasInventory())void restore(false);
})();