"use strict";
(() => {
const $=id=>document.getElementById(id);
const status=(text,error=false)=>{const el=$("shareStatus");el.textContent=text;el.style.color=error?"#ffbbac":"#a3f5ce";};
const enc=object=>{
  const bytes=new TextEncoder().encode(JSON.stringify(object));
  if(bytes.length>2600)throw Error("Параметры не помещаются в короткую QR-ссылку.");
  let str="";for(const b of bytes)str+=String.fromCharCode(b);
  return btoa(str).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
};
const dec=value=>{
  if(!/^[a-zA-Z0-9_-]{1,4800}$/.test(value))throw Error("Ссылка повреждена.");
  const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/"));
  if(raw.length>2600)throw Error("Ссылка слишком длинная.");
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if(obj?.v!==1||typeof obj.k!=="string"||Object.keys(obj).length>12)throw Error("Неизвестный формат ссылки.");
  return obj;
};
let url="";
window.MapkeppShare = Object.freeze({
 preserveForOAuth(){
  let encoded=new URLSearchParams(location.hash.slice(1)).get("config")||"";
  if(!encoded){
    try{encoded=enc(window.MapkeppStudio.getShareData());}
    catch{return false;}
  }
  if(!encoded||encoded.length>4800)return false;
  try{sessionStorage.setItem("mapkepp.share.pending",encoded);return true;}
  catch{return false;}
 }
});

function getURL(){
 const model=window.MapkeppStudio.getShareData();
 // A second, independent guard: the public link must not contain the Yandex token.
 const privateToken=$("oauthToken").value.trim();
 const clean=JSON.stringify(model);
 if(privateToken.length>11&&clean.includes(privateToken))throw Error("Ссылка могла бы раскрыть токен; создание остановлено.");
 const target=new URL(location.origin+location.pathname);
 target.hash="config="+enc(model);
 return target.href;
}
function showLink(link){
 url=link;
 $("shareUrl").hidden=false;
 $("shareUrlLabel").hidden=false;
 $("shareUrl").value=link;
 $("copyShare").hidden=false;
 $("showQR").hidden=false;
 $("qrPanel").hidden=true;
 $("qrTarget").replaceChildren();
 status("Настроенная команда подготовлена. Ссылка не содержит токен. Можно отправить её в мессенджер или показать QR-код.");
}
$("makeShare").addEventListener("click",()=>{
 try{showLink(getURL());}catch(e){status(e.message,true);}
});
$("copyShare").addEventListener("click",async()=>{
 try{if(!url)throw Error("Сначала создайте ссылку.");await navigator.clipboard.writeText(url);status("Ссылка скопирована. В ней нет токена, но указан выбранный объект умного дома.");}
 catch(e){status("Не удалось скопировать: "+e.message,true);}
});
function localQRScript(){
 return new Promise((resolve,reject)=>{
  if(typeof window.QRCode==="function")return resolve();
  const script=document.createElement("script");
  script.src="./vendor/qrcode.min.js";
  script.referrerPolicy="no-referrer";
  script.onload=()=>typeof window.QRCode==="function"?resolve():reject(Error("Библиотека QR-кода не загрузилась."));
  script.onerror=()=>reject(Error("Не удалось загрузить встроенную библиотеку QR-кода."));
  document.head.append(script);
 });
}
$("showQR").addEventListener("click",async()=>{
 try{
  if(!url)throw Error("Сначала создайте ссылку.");
  status("Создаём QR-код на этом устройстве, без внешних QR-сервисов.");
  await localQRScript();
  const mount=$("qrTarget");mount.replaceChildren();
  new window.QRCode(mount,{text:url,width:220,height:220,colorDark:"#091322",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.L});
  $("qrPanel").hidden=false;
  status("QR-код создан локально. Откройте камеру iPhone и наведите на код.");
 }catch(e){status(e.message,true);}
});
$("copyToken").addEventListener("click",async()=>{
 try{
  const token=$("oauthToken").value.trim().replace(/^Bearer\s+/i,"");
  if(!/^[A-Za-z0-9_.~+\/=-]{12,4096}$/.test(token))throw Error("Сначала авторизуйтесь в Яндексе или вставьте токен.");
  await navigator.clipboard.writeText(token);
  window.MapkeppStudio.showStatus("Личный OAuth-токен скопирован. Теперь его можно вставить при установке команды на iPhone. Не отправляйте его другим людям.");
 }catch(e){window.MapkeppStudio.showStatus("Копирование не удалось: "+e.message,true);}
});
$("revealToken").addEventListener("click",()=>{
 const inp=$("oauthToken");inp.type=inp.type==="password"?"text":"password";
});
function postToSigner(file){
 const dt=new DataTransfer();dt.items.add(file);
 const form=document.createElement("form");
 form.method="POST";form.enctype="multipart/form-data";form.action="https://sign.shortcuty.app/api/v1/sign";form.target="_blank";form.hidden=true;
 const input=document.createElement("input");input.type="file";input.name="file";input.files=dt.files;
 form.append(input);document.body.append(form);form.submit();form.remove();
}
$("downloadDanger").addEventListener("click",()=>{
 try{
  if(!$("dangerConsent1").checked||!$("dangerConsent2").checked || $("dangerPhrase").value.trim()!=="ПЕРЕДАТЬ ДОСТУП")
    throw Error("Требуются оба подтверждения и фраза ПЕРЕДАТЬ ДОСТУП.");
  if(!$("signConsent").checked)throw Error("Подтвердите также согласие на подпись внешним сервисом.");
  const output=window.MapkeppStudio.signWithEmbeddedToken();
  if(!window.confirm("ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ\n\nТокен вашего Яндекса будет отправлен Shortcuty вместе с командой. Любой получивший файл сможет управлять вашим умным домом.\n\nПродолжить создание именно такого файла?"))return;
  postToSigner(output);
  window.MapkeppStudio.showStatus("Команда со встроенным токеном направлена на подпись Shortcuty. Не публикуйте полученный файл!");
 }catch(e){window.MapkeppStudio.showStatus(e.message,true);}
});
// A share URL contains only inert configuration and never performs network requests by itself.
try{
 const hash=new URLSearchParams(location.hash.slice(1));
 let encoded=hash.get("config");
 if(!encoded){try{encoded=sessionStorage.getItem("mapkepp.share.pending")||"";sessionStorage.removeItem("mapkepp.share.pending");}catch{}}
 if(encoded){
   const model=dec(encoded);
   window.MapkeppStudio.restoreShare(model);
   const target=new URL(location.origin+location.pathname);target.hash="config="+encoded;
   showLink(target.href);
   status("Команда открыта из ссылки — параметры восстановлены. Перед скачиванием проверьте их и авторизуйтесь в своём Яндексе, если хотите использовать свою учётную запись.");
 }
}catch(e){status("Не удалось открыть сохранённую настройку: "+e.message,true);}
})();