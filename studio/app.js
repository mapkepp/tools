"use strict";
(() => {
const $=id=>document.getElementById(id);
const limit=2800000;
let data=null, selected=null, example=false;
const API="https://api.iot.yandex.net/v1.0";
const SIGN="https://sign.shortcuty.app/api/v1/sign";
const backendUrl=String(window.MAPKEPP_HOME_API_URL||"").trim();
const OAUTH_CLIENT_ID="e5942ee8886149dfadc84fa3bc89049a";
const TEMP_TOKEN_KEY="mapkepp.yandex.oauth.tmp."+OAUTH_CLIENT_ID;
const STATE_KEY="mapkepp.yandex.oauth.state."+OAUTH_CLIENT_ID;
const CONSENT_KEY="mapkepp.yandex.oauth.consent."+OAUTH_CLIENT_ID;
const TOKEN_TIME_KEY="mapkepp.yandex.oauth.issued."+OAUTH_CLIENT_ID;
let busy=false;
const diagLines=[];
let loadTicker=null, loadT0=0;
function logSafe(code,details=""){
  const line=new Date().toISOString().slice(11,23)+"Z | "+code+(details?" | "+details:"");
  diagLines.push(line);
  if(diagLines.length>100)diagLines.shift();
  const out=$("networkDiagnosticLog");
  if(out){out.textContent=diagLines.join("\n");out.scrollTop=out.scrollHeight;}
}
function updateElapsed(){
  const elapsed=Math.round((performance.now()-loadT0)/1000);
  const out=$("loadElapsed");
  if(out)out.textContent="Прошло "+elapsed+" с · индикатор движения показывает ожидание, а не объём данных";
}
function startLoadTicker(){loadT0=performance.now();if(loadTicker)clearInterval(loadTicker);updateElapsed();loadTicker=setInterval(updateElapsed,250);}
function stopLoadTicker(){if(loadTicker)clearInterval(loadTicker);loadTicker=null;}
async function readBodyWithProgress(response,controller,attempt){
  const expected=Number(response.headers.get("content-length")||0);
  const size=Number.isFinite(expected)&&expected>0?expected:0;
  const bytesFromServer=response.headers.get("x-mapkepp-body-bytes");
  logSafe("response_headers","attempt="+attempt+" status="+response.status+" expected_bytes="+size+" advertised_bytes="+(Number(bytesFromServer)||0)+" type="+(response.headers.get("content-type")?.includes("json")?"json":"other"));
  if(!response.body||typeof response.body.getReader!=="function"){
    logSafe("reader_fallback","browser stream reader unavailable");
    const text=await response.text();
    logSafe("body_complete","attempt="+attempt+" characters="+text.length);
    return text;
  }
  const reader=response.body.getReader(),chunks=[];
  let received=0,lastMark=0,first=true;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      received+=value.byteLength;
      if(first){logSafe("first_chunk","attempt="+attempt+" bytes="+value.byteLength);first=false;}
      if(received>3000000)throw Error("body_size_limit");
      chunks.push(value);
      if(received-lastMark>=131072){logSafe("transfer","attempt="+attempt+" bytes="+received);lastMark=received;}
      if(size>0){
        const fraction=Math.min(1,received/size);
        progressStage("Загружаем данные","Получено "+received+" байт из заявленных "+size+" (по сетевым заголовкам).",Math.min(89,65+Math.round(fraction*23)));
      }else{
        progressStage("Загружаем данные","Получено "+received+" байт; полный размер сервер не указал.");
      }
    }
    const joined=new Uint8Array(received);let offset=0;
    for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    const text=new TextDecoder("utf-8",{fatal:true}).decode(joined);
    logSafe("body_complete","attempt="+attempt+" bytes="+received+" characters="+text.length);
    return text;
  }finally{reader.releaseLock();}
}

function proxyIsConfigured(){
  try{
    const u=new URL(backendUrl);
    return u.protocol==="https:" && !u.username && !u.password && !u.search && !u.hash && (u.pathname==="/api/yandex-home" || (u.hostname.endsWith(".supabase.co") && u.pathname==="/functions/v1/yandex-home"));
  }catch{return false;}
}
function progressStage(stage,detail,percent){
  $("loadProgress").hidden=false;
  $("loadStep").textContent=stage;
  $("loadDetail").textContent=detail;
  if(typeof percent==="number")$("loadBar").value=percent;
  else $("loadBar").removeAttribute("value");
}
function endProgress(){
  $("loadProgress").hidden=true;
  $("loadBar").removeAttribute("value");
}
function setBackendNotice(){
  $("backendStatus").textContent=proxyIsConfigured()
   ?"Защищённый серверный обработчик подключён. Токен используется только для чтения данных вашего дома."
   :"Автоматическая загрузка временно недоступна: ещё не подключён серверный обработчик. Токен можно вставить, но до подключения сервера он никуда не отправится. Автоматическая загрузка заработает после подключения обработчика. Дополнительно доступен импорт ранее сохранённого JSON.";
}
function asHumanError(error,statusCode){
  if(statusCode===401||error==="unauthorized")return "Яндекс отказал в доступе: токен истёк или не имеет прав iot:view. Получите новое разрешение.";
  if(error==="yandex_timeout")return "Яндекс долго не отвечает. Попробуйте повторить запрос.";
  if(error==="yandex_unavailable")return "Сервер не смог связаться с API Яндекса.";
  if(error==="invalid_token_format")return "Некорректный формат токена. Вставьте токен без слова Bearer.";
  if(error==="origin_not_allowed")return "Адрес сайта не разрешён серверным обработчиком.";
  return "Не удалось загрузить данные. Проверьте соединение с Яндексом и повторите запрос.";
}
async function loadFromYandex(){
 if(busy)return;
 const input=$("oauthToken");
 const token=input.value.trim().replace(/^Bearer\s+/i,"");
 if(!token){status("Сначала войдите через Яндекс или вставьте полученный токен.",true);return;}
 if(!/^[A-Za-z0-9_.~+\/=-]{12,4096}$/.test(token)){status("Токен содержит недопустимые символы. Скопируйте его из Яндекса без слова Bearer.",true);return;}
 if(!$("proxyConsent").checked){status("Подтвердите передачу токена нашему защищённому обработчику для одного запроса к Яндексу.",true);return;}
 if(!proxyIsConfigured()){setBackendNotice();status("Серверный обработчик недоступен. Токен не отправлялся. Можно импортировать ранее сохранённый JSON.",true);return;}
 busy=true;$("loadDevices").disabled=true;
 try{
   startLoadTicker();
   logSafe("load_start","build=20261022-17; attempts_max=2");
   let resp,raw;
   for(let attempt=1;attempt<=2;attempt++){
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),35000);
     const started=performance.now();
     let phase="fetch";
     try{
       logSafe("request_start","attempt="+attempt+" max_ms=35000");
       progressStage("Получаем устройства",attempt===1?"Запрашиваем данные умного дома…":"Повторяем получение после обрыва передачи…");
       resp=await fetch(backendUrl,{method:"POST",mode:"cors",credentials:"omit",redirect:"error",
         headers:{"Content-Type":"application/json"},cache:"no-store",referrerPolicy:"no-referrer",
         body:JSON.stringify({access_token:token}),signal:controller.signal});
       logSafe("headers_received","attempt="+attempt+" status="+resp.status+" latency_ms="+Math.round(performance.now()-started));
       phase="body";
       progressStage("Читаем ответ сервера","HTTP "+resp.status+". Начинаем чтение содержимого…");
       raw=await readBodyWithProgress(resp,controller,attempt);
       break;
     }catch(error){
       const reason=controller.signal.aborted?"timeout":error?.message==="body_size_limit"?"size_limit":error?.name==="TypeError"?"network_typeerror":error?.name==="AbortError"?"aborted":"stream_error";
       logSafe("attempt_failed","attempt="+attempt+" phase="+phase+" reason="+reason+" elapsed_ms="+Math.round(performance.now()-started));
       if(reason==="size_limit")throw Error("Ответ превышает допустимый размер.");
       if(attempt===2){
         throw Error(reason==="timeout"
           ?"Ответ не был полностью получен за 35 секунд. Две попытки завершились без результата. Скопируйте безопасный журнал диагностики."
           :"Ошибка чтения данных сервера. Две попытки завершились без результата. Скопируйте безопасный журнал диагностики.");
       }
       logSafe("retry_scheduled","after_failed_attempt="+attempt);
     }finally{clearTimeout(timeout);}
   }
   logSafe("parse_start","characters="+raw.length);
   progressStage("Проверяем ответ","Данные полностью получены; проверяем JSON.",90);
   if(raw.length>3_000_000)throw Error("Ответ слишком большой.");
   let parsed;try{parsed=JSON.parse(raw);}catch{logSafe("json_parse_failed","invalid_json");throw Error("Сервер вернул некорректный JSON.");}
   if(!resp.ok){logSafe("http_failure","status="+resp.status);throw Error(asHumanError(parsed?.error,resp.status));}
   progressStage("Готовим список","Сортируем дома, комнаты, устройства и сценарии.",85);
   loadRaw(JSON.stringify(parsed));
   logSafe("load_success","households="+parsed.households.length+" rooms="+parsed.rooms.length+" devices="+parsed.devices.length+" groups="+parsed.groups.length+" scenarios="+parsed.scenarios.length);
   status("Дом загружен: "+parsed.households.length+" домов, "+parsed.rooms.length+" комнат, "+parsed.devices.length+" устройств, "+parsed.groups.length+" групп, "+parsed.scenarios.length+" сценариев.");
   tokenCheck("Токен подтверждён API Яндекс Умного дома. Устройства и сценарии получены.",true);
   progressStage("Готово!","Устройства уже отображены. Данные профиля проверяются отдельно.",100);
   void readYandexIdentity(token).catch(()=>{});
   $("pick").scrollIntoView({behavior:"smooth",block:"start"});
   setTimeout(endProgress,2000);
 }catch(e){
   endProgress();
   logSafe("load_failed","completed=false");
   tokenCheck("Загрузка не завершилась. Это не доказывает, что токен недействителен.");
   status(e?.name==="AbortError"?"Время ожидания истекло. Повторите запрос.":String(e?.message||e),true);
 }finally{stopLoadTicker();busy=false;$("loadDevices").disabled=false;}
}
async function readYandexIdentity(token){
 const idBox=$("accountInfo"), name=$("accountName"), login=$("accountLogin"), avatar=$("accountAvatar");
 idBox.hidden=false;
 name.textContent="Аккаунт Яндекса";
 login.textContent="Проверяем логин…";
 avatar.hidden=true;avatar.removeAttribute("src");
 try{
  const endpoint="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/yandex-profile";
  const controller=new AbortController();
  const time=setTimeout(()=>controller.abort(),11000);
  let r;
  try{r=await fetch(endpoint,{method:"POST",mode:"cors",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({access_token:token}),signal:controller.signal});
  }finally{clearTimeout(time);}
  if($("oauthToken").value.trim().replace(/^Bearer\s+/i,"")!==token)return;
  if(!r.ok)throw Error("profile access unavailable");
  const info=await r.json();
  if(typeof info.login!=="string"||!info.login)throw Error("profile login missing");
  const display=[info.display_name,info.real_name,info.first_name,info.login].find(x=>typeof x==="string"&&x.trim());
  name.textContent=display||info.login;
  login.textContent="Яндекс ID: "+info.login;
  tokenCheck("Токен подтверждён. Аккаунт Яндекса: "+info.login+". Устройства загружены.",true);
  if(!info.is_avatar_empty && typeof info.avatar_id==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(info.avatar_id)){
    avatar.src="https://avatars.yandex.net/get-yapic/"+encodeURIComponent(info.avatar_id)+"/islands-75";
    avatar.hidden=false;
  }
 }catch{
  name.textContent="Аккаунт не определён";
  login.textContent="Имя и фото недоступны. В настройках OAuth-приложения могут потребоваться права login:info и login:avatar.";
 }
}
function tokenCheck(message,valid=false){
 const panel=$("tokenCheck");
 if(!panel)return;
 panel.textContent=message;
 panel.classList.toggle("warning",!valid);
}
function clearAccountView(){
 $("accountInfo").hidden=true;
 $("accountAvatar").hidden=true;
 $("accountAvatar").removeAttribute("src");
 $("accountName").textContent="Аккаунт Яндекса";
 $("accountLogin").textContent="";
}
function beginYandexAuth(){
 // Force the official Yandex account picker even if the browser remembers
 // a previous grant for this application. No user token is put in the URL.
 const stateBytes=new Uint8Array(24);
 crypto.getRandomValues(stateBytes);
 const state=Array.from(stateBytes,b=>b.toString(16).padStart(2,"0")).join("");
 try{
   sessionStorage.setItem(STATE_KEY,state);
   sessionStorage.setItem(CONSENT_KEY,$("proxyConsent").checked?"yes":"no");
   sessionStorage.removeItem(TEMP_TOKEN_KEY);
   sessionStorage.removeItem(TOKEN_TIME_KEY);
   const cfg=new URLSearchParams(location.hash.slice(1)).get("config");
   if(cfg)sessionStorage.setItem("mapkepp.share.pending",cfg);
 }catch{
   status("Браузер запретил временное хранение. Разрешите его для сайта или вставьте токен вручную.",true);
   return;
 }
 $("oauthToken").value="";
 clearAccountView();
 tokenCheck("Выберите учётную запись на официальном сайте Яндекса. Старый токен очищен.");
 // Reset the displayed Yandex home; never display stale devices under the next account.
 if(!location.hash.includes("config=")){
   data=null;selected=null;
   $("actionArea").classList.remove("open");
   render();
 }
 const url=new URL($("yandexAuth").href);
 url.searchParams.set("state",state);
 url.searchParams.set("force_confirm","yes");
 const loginHint=$("loginHint").value.trim();
 if(loginHint){
   if(loginHint.length>120||/[?#&\s]/.test(loginHint)){
     status("Логин Яндекса указан некорректно. Введите логин или адрес почты.",true);
     return;
   }
   url.searchParams.set("login_hint",loginHint);
 }else url.searchParams.delete("login_hint");
 location.assign(url.toString());
}
function initOAuth(){
 setBackendNotice();
 const input=$("oauthToken");
 input.value="";                 // Never trust browser password-manager autofill.
 input.readOnly=true;            // Most autofill managers skip readonly fields.
 let tempToken="",issuedAt=0;
 try{
   tempToken=sessionStorage.getItem(TEMP_TOKEN_KEY)||"";
   issuedAt=Number(sessionStorage.getItem(TOKEN_TIME_KEY)||0);
   sessionStorage.removeItem(TEMP_TOKEN_KEY);
   sessionStorage.removeItem(TOKEN_TIME_KEY);
   // Invalidate all tokens and state created before the new OAuth application.
   for(const key of ["mapkepp.yandex.oauth.tmp","mapkepp.yandex.oauth.state","mapkepp.yandex.oauth.consent"]){
     sessionStorage.removeItem(key);
   }
   if(sessionStorage.getItem(CONSENT_KEY)==="yes")$("proxyConsent").checked=true;
   sessionStorage.removeItem(CONSENT_KEY);
 }catch{}
 const fresh=issuedAt>0 && Date.now()-issuedAt>=0 && Date.now()-issuedAt<300000;
 if(tempToken && fresh && /^[A-Za-z0-9_.~+\/=-]{12,4096}$/.test(tempToken)){
   input.value=tempToken;
   tokenCheck("Токен нового Яндекс-приложения получен, но ещё не проверен API.",false);
   status("Авторизация возвращена. Проверяем доступ к Умному дому.");
   if(proxyIsConfigured()&&$("proxyConsent").checked&&!sessionStorage.getItem("mapkepp.share.pending"))queueMicrotask(loadFromYandex);
 }else if(tempToken){
   tokenCheck("Устаревший или неподтверждённый токен отклонён. Авторизуйтесь заново.",false);
   status("Устаревший токен удалён, старое OAuth-приложение больше не используется.",true);
 }
 function unlockInput(){
    input.readOnly=false;
 }
 input.addEventListener("pointerdown",unlockInput);
 input.addEventListener("focus",unlockInput);
 $("loadDevices").addEventListener("click",loadFromYandex);
 $("copyNetworkDiagnostics")?.addEventListener("click",async()=>{
   try{await navigator.clipboard.writeText("Mapkepp Tools — безопасная диагностика загрузки\n"+diagLines.join("\n"));status("Журнал без токена и данных устройств скопирован.");}
   catch{status("Копирование недоступно. Выделите текст в блоке «Диагностика загрузки».",true);}
 });
 $("clearNetworkDiagnostics")?.addEventListener("click",()=>{diagLines.length=0;$("networkDiagnosticLog").textContent="Журнал очищен.";});

 $("clearOAuth").addEventListener("click",()=>{
   input.value="";input.type="password";input.readOnly=true;
   $("proxyConsent").checked=false;endProgress();clearAccountView();
   try{
     for(const key of [TEMP_TOKEN_KEY,STATE_KEY,CONSENT_KEY,TOKEN_TIME_KEY,
       "mapkepp.yandex.oauth.tmp","mapkepp.yandex.oauth.state","mapkepp.yandex.oauth.consent"])
       sessionStorage.removeItem(key);
   }catch{}
   tokenCheck("Личный токен очищен. Чтобы подключить аккаунт, войдите через Яндекс.",false);
   status("Токен удалён из поля и временной памяти этого сайта.");
 });
 input.addEventListener("input",()=>{
   clearAccountView();
   tokenCheck("Токен изменён. Его действительность и аккаунт ещё не проверены.",false);
 });
 $("yandexAuth").addEventListener("click",e=>{e.preventDefault();beginYandexAuth();});
 $("switchYandexAccount").addEventListener("click",beginYandexAuth);
}

const clone=s=>JSON.parse(JSON.stringify(s));
const demo={
 status:"ok",
 households:[{id:"h1",name:"Квартира"},{id:"h2",name:"Дача"}],
 rooms:[{id:"r1",name:"Кухня",household_id:"h1",devices:["l1","s1"]},{id:"r2",name:"Спальня",household_id:"h1",devices:["l2"]},{id:"r3",name:"Гостиная",household_id:"h2",devices:["l3"]}],
 devices:[
 {id:"l1",household_id:"h1",room:"r1",name:"Люстра",type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:false}},{type:"devices.capabilities.range",parameters:{instance:"brightness",range:{min:1,max:100,precision:1}},state:{instance:"brightness",value:75}}]},
 {id:"s1",household_id:"h1",room:"r1",name:"Розетка чайника",type:"devices.types.socket",capabilities:[{type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:true}}]},
 {id:"l2",household_id:"h1",room:"r2",name:"Ночник",type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:true}}]},
 {id:"l3",household_id:"h2",room:"r3",name:"Подсветка",type:"devices.types.light",capabilities:[{type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:true}}]}
 ],
 groups:[{id:"g1",household_id:"h1",name:"Весь свет",type:"devices.types.light",devices:["l1","l2"],capabilities:[{type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:true}}]}],
 scenarios:[{id:"sc1",name:"Доброе утро",is_active:true},{id:"sc2",name:"Спокойной ночи",is_active:true},{id:"sc3",name:"Неактивный сценарий",is_active:false}]
};
function status(text,bad=false){$("status").textContent=text;$("status").classList.toggle("warning",bad);}
const escapeText=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const typeIcon=t=>t==="scenario"?"🎬":t==="group"?"🔗":t.includes(".light")?"💡":t.includes(".socket")?"🔌":t.includes(".thermostat")?"🌡️":"◻";
const encId=id=>encodeURIComponent(id);
function loadRaw(raw){
 if(raw.length>limit)throw Error("Список слишком большой (более 1,2 МБ).");
 // Reject secrets rather than encourage accidental uploads.
 if(/"((?:access|refresh|oauth)[_-]?token|client_secret)"\s*:/i.test(raw))throw Error("В JSON найдено поле секретного токена. Экспортируйте только список устройств без токенов.");
 const o=JSON.parse(raw);
 if(!o||typeof o!=="object"||Array.isArray(o)||!["ok",undefined].includes(o.status))throw Error("Это не успешный ответ API Яндекс Умного дома.");
 for(const k of ["households","rooms","devices","groups","scenarios"]){if(!Array.isArray(o[k]))throw Error("В ответе отсутствует массив "+k+".");if(o[k].length>1500)throw Error("Слишком много объектов: "+k);}
 for(const k of ["households","rooms","devices","groups","scenarios"]){
  for(const x of o[k]){if(!x||typeof x.id!=="string"||typeof x.name!=="string"||x.id.length>200||x.name.length>400)throw Error("Некорректный элемент в "+k+".");}
 }
 data=o;selected=null;example=false;render();
 const count=o.devices.length+o.groups.length+o.scenarios.length;
 status("Список готов: "+o.households.length+" домов, "+o.rooms.length+" комнат, "+count+" объектов.");
}
function pick(kind,obj){
 selected={kind,obj};
 document.querySelectorAll(".item.selected").forEach(el=>el.classList.remove("selected"));
 document.querySelectorAll(".item").forEach(el=>{if(el.dataset.kind===kind&&el.dataset.id===obj.id){el.classList.add("selected");}});
 $("actionArea").classList.add("open");
 $("selected").textContent=(kind==="scenario"?"Сценарий":kind==="group"?"Группа":"Устройство")+": "+obj.name;
 $("shortcutName").value=obj.name+(kind==="scenario"?" — запустить":" — включить");
 fillCapabilities(); updatePreview();
 if(window.innerWidth<760)$("config").scrollIntoView({behavior:"smooth",block:"start"});
}
const getActions=(kind,obj)=>{
 if(kind==="scenario")return obj.is_active===false?[]:[{label:"Запустить сценарий",cap:"scenario",instance:""}];
 const result=[];
 for(const cap of obj.capabilities||[]){
   const typ=cap?.type||"",p=cap?.parameters||{};
   if(typ==="devices.capabilities.on_off"){
     result.push({label:"Включить",cap:"on_off",instance:"on",value:true});
     result.push({label:"Выключить",cap:"on_off",instance:"on",value:false});
   }else if(typ==="devices.capabilities.range" && typeof p.instance==="string" && p.range){
     const inst=p.instance, range=p.range;
     if(Number.isFinite(range.min)&&Number.isFinite(range.max)&&range.max>range.min)
       result.push({label:inst==="brightness"?"Изменить яркость":inst==="temperature"?"Установить температуру":"Задать "+inst,cap:"range",instance:inst,range});
   }else if(typ==="devices.capabilities.color_setting" && p.temperature_k){
     const range=p.temperature_k;
     if(Number.isFinite(range.min)&&Number.isFinite(range.max))
       result.push({label:"Цветовая температура (K)",cap:"color_setting",instance:"temperature_k",range});
   }else if(typ==="devices.capabilities.mode"&&p.instance&&Array.isArray(p.modes)&&p.modes.length){
     const modes=p.modes.filter(x=>typeof x.value==="string");
     if(modes.length)result.push({label:"Режим "+p.instance,cap:"mode",instance:p.instance,modes});
   }
 }
 return result;
};
function fillCapabilities(){
 const sel=$("actionSelect");sel.replaceChildren();
 const a=getActions(selected.kind,selected.obj);
 if(!a.length){const option=new Option("Нет поддерживаемых действий","");sel.add(option);sel.disabled=true;$("downloadSign").disabled=true;$("downloadUnsigned").disabled=true;$("actionHint").textContent="Объект не поддерживает доступные операции конструктора или сценарий отключён.";}
 else{sel.disabled=false;$("downloadSign").disabled=false;$("downloadUnsigned").disabled=false;for(let i=0;i<a.length;i++)sel.add(new Option(a[i].label,String(i)));$("actionHint").textContent="Показаны только операции из capabilities данного объекта.";}
 sel._actions=a;renderInput();
}
function currentAction(){const i=Number($("actionSelect").value);return $("actionSelect")._actions?.[i]||null;}
function renderInput(){
 const area=$("valueControls");area.replaceChildren();
 const a=currentAction();if(!a)return;
 if(a.range){
 const label=document.createElement("label");label.textContent="Значение ("+a.range.min+"–"+a.range.max+")";
 const input=document.createElement("input");input.id="actionValue";input.type="number";input.min=String(a.range.min);input.max=String(a.range.max);input.step=String(a.range.precision||1);
 input.value=String(Math.min(a.range.max,Math.max(a.range.min,selected.obj.capabilities?.find(c=>c.type.endsWith(a.cap))?.state?.value??a.range.min)));
 input.addEventListener("input",updatePreview);label.appendChild(input);area.appendChild(label);
 }
 if(a.modes){
 const label=document.createElement("label");label.textContent="Режим";
 const select=document.createElement("select");select.id="actionValue";
 for(const mode of a.modes)select.add(new Option(mode.value,mode.value));
 select.addEventListener("change",updatePreview);label.appendChild(select);area.appendChild(label);
 }
 updatePreview();
}
function request(){
 if(!selected)throw Error("Выберите устройство или сценарий.");
 const {kind,obj}=selected,a=currentAction();
 if(!a)throw Error("Объект не поддерживает доступные действия.");
 if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(obj.id))throw Error("ID содержит неподдерживаемые символы.");
 if(a.cap==="scenario")return {url:API+"/scenarios/"+encId(obj.id)+"/actions",body:null};
 let value=a.value;
 if(a.range){value=Number($("actionValue")?.value);const step=a.range.precision||1;
   if(!Number.isFinite(value)||value<a.range.min||value>a.range.max||Math.abs((value-a.range.min)/step-Math.round((value-a.range.min)/step))>1e-5)throw Error("Введите допустимое значение от "+a.range.min+" до "+a.range.max+" с шагом "+step+".");
 }else if(a.modes){value=$("actionValue")?.value;if(!a.modes.some(m=>m.value===value))throw Error("Режим не поддерживается.");}
 const action={type:"devices.capabilities."+a.cap,state:{instance:a.instance,value}};
 if(kind==="device")return {url:API+"/devices/actions",body:{devices:[{id:obj.id,actions:[action]}]}};
 return {url:API+"/groups/"+encId(obj.id)+"/actions",body:{actions:[action]}};
}
function updatePreview(){
 try{const p=request();$("jsonPreview").textContent="POST "+p.url+"\n"+(p.body?JSON.stringify(p.body,null,2):"Без тела запроса");}
 catch(e){$("jsonPreview").textContent=e.message;}
}
const button=(kind,obj,extra="")=>{
 const b=document.createElement("button");b.type="button";b.className="item";b.dataset.kind=kind;b.dataset.id=obj.id;
 const left=document.createElement("span"),name=document.createElement("strong"),sub=document.createElement("small");
 name.textContent=(kind==="scenario"?typeIcon(kind):typeIcon(obj.type||kind))+" "+obj.name;sub.textContent=extra;
 left.append(name,sub);const arrow=document.createElement("span");arrow.textContent="›";b.append(left,arrow);
 if(kind==="scenario"&&obj.is_active===false){b.disabled=true;sub.textContent="Сценарий неактивен";}
 b.addEventListener("click",()=>pick(kind,obj));
 if(selected?.kind===kind&&selected.obj.id===obj.id)b.classList.add("selected");
 return b;
};
function section(parent,name){
 const s=document.createElement("div");s.className="tree-section";const h=document.createElement("div");h.className="tree-title";h.textContent=name;s.append(h);parent.append(s);return s;
}
function render(){
 const tree=$("tree");tree.replaceChildren();
 if(!data){tree.append(Object.assign(document.createElement("p"),{className:"muted",textContent:"Загрузите JSON или откройте пример."}));$("stats").textContent="";return;}
 const query=$("search").value.trim().toLocaleLowerCase("ru");
 const match=x=>!query||String(x.name).toLocaleLowerCase("ru").includes(query);
 const allDevices=data.devices||[],allRooms=data.rooms||[],allGroups=data.groups||[],houses=[...data.households];
 if(!houses.length)houses.push({id:"",name:"Мой умный дом"});
 let total=0;
 for(const house of houses){
  const box=document.createElement("div");
  const rooms=allRooms.filter(r=>!r.household_id||r.household_id===house.id);
  const belonging=allDevices.filter(d=>!d.household_id||d.household_id===house.id);
  let count=0;
  for(const room of rooms){
    const roomDev=belonging.filter(d=>(Array.isArray(room.devices)&&room.devices.includes(d.id)) || d.room===room.id).filter(d=>match(d)||match(room)||match(house));
    if(!roomDev.length)continue;
    if(!count){}const roomBox=document.createElement("div");roomBox.className="room";
    const name=document.createElement("div");name.className="room-title";name.textContent="🚪 "+room.name;roomBox.append(name);
    for(const d of roomDev){roomBox.append(button("device",d,d.type?.split(".").pop()||""));total++;}
    box.append(roomBox);count+=roomDev.length;
  }
  const assigned=new Set(rooms.flatMap(r=>(Array.isArray(r.devices)?r.devices:[])));
  const unassigned=belonging.filter(d=>!assigned.has(d.id)&&!rooms.some(r=>r.id===d.room)).filter(d=>match(d)||match(house));
  if(unassigned.length){const wrap=document.createElement("div");wrap.className="room";const n=document.createElement("div");n.className="room-title";n.textContent="📦 Без комнаты";wrap.append(n);for(const d of unassigned){wrap.append(button("device",d));total++;}box.append(wrap);}
  const groupItems=allGroups.filter(g=>(!g.household_id||g.household_id===house.id)&&(match(g)||match(house)));
  if(groupItems.length){const wrap=document.createElement("div");wrap.className="room";const n=document.createElement("div");n.className="room-title";n.textContent="🔗 Группы устройств";wrap.append(n);for(const g of groupItems){wrap.append(button("group",g,(g.devices||[]).length+" устройств"));total++;}box.append(wrap);}
  if(box.childElementCount){const block=section(tree,"🏠 "+house.name);block.append(box);}
 }
 const sc=(data.scenarios||[]).filter(match);
 if(sc.length){const block=section(tree,"🎬 Сценарии");for(const s of sc){block.append(button("scenario",s,s.is_active===false?"Недоступен":"Запустить"));total++;}}
 if(!total)tree.textContent="По вашему запросу ничего не найдено.";
 $("stats").textContent=total+" найдено · "+data.households.length+" домов · "+data.rooms.length+" комнат · "+data.devices.length+" устройств · "+data.groups.length+" групп · "+data.scenarios.length+" сценариев"+(example?" · ДЕМОНСТРАЦИЯ":"");
}
const tt=(value,refs)=>({WFSerializationType:"WFTextTokenString",Value:{string:value,...(refs?{attachmentsByRange:refs}:{})}});
function dict(obj){
 return {WFSerializationType:"WFDictionaryFieldValue",Value:{WFDictionaryFieldValueItems:Object.entries(obj).map(([key,value])=>{
  const item={WFKey:tt(key)};
  if(typeof value==="string")Object.assign(item,{WFItemType:0,WFValue:tt(value)});
  else if(typeof value==="boolean")Object.assign(item,{WFItemType:4,WFValue:{WFSerializationType:"WFNumberSubstitutableState",Value:value}});
  else if(typeof value==="number")Object.assign(item,{WFItemType:3,WFValue:{WFSerializationType:"WFNumberSubstitutableState",Value:value}});
  else if(Array.isArray(value))Object.assign(item,{WFItemType:2,WFValue:{WFSerializationType:"WFArrayParameterState",Value:value.map(v=>{const entry=dict({x:v}).Value.WFDictionaryFieldValueItems[0];delete entry.WFKey;return entry;})}});
  else if(value&&typeof value==="object")Object.assign(item,{WFItemType:1,WFValue:dict(value)});
  else throw Error("Некорректное значение.");
  return item;
 })}};
}
function xml(v){
 if(Array.isArray(v))return "<array>"+v.map(xml).join("")+"</array>";
 if(typeof v==="object"&&v)return "<dict>"+Object.keys(v).map(k=>"<key>"+escapeText(k)+"</key>"+xml(v[k])).join("")+"</dict>";
 if(typeof v==="string")return "<string>"+escapeText(v)+"</string>";
 if(typeof v==="boolean")return v?"<true/>":"<false/>";
 if(typeof v==="number"&&Number.isFinite(v))return Number.isInteger(v)?"<integer>"+v+"</integer>":"<real>"+v+"</real>";
 throw Error("Неизвестный тип данных.");
}
function uid(){if(crypto?.randomUUID)return crypto.randomUUID().toUpperCase();const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();}
function file(embeddedToken=""){
 const p=request(),name=$("shortcutName").value.trim();
 if(!name||name.length>60)throw Error("Введите название команды до 60 символов.");
 const id=uid(),headers=dict(p.body?{"Content-Type":"application/json"}:{});
 headers.Value.WFDictionaryFieldValueItems.push({WFKey:tt("Authorization"),WFItemType:0,WFValue:tt("Bearer \uFFFC",{"{7, 1}":{Type:"ActionOutput",OutputUUID:id,OutputName:"Text"}})});
 const acts=[
 {WFWorkflowActionIdentifier:"is.workflow.actions.gettext",WFWorkflowActionParameters:{UUID:id,WFTextActionText:embeddedToken||"YANDEX_OAUTH_TOKEN"}},
 {WFWorkflowActionIdentifier:"is.workflow.actions.downloadurl",WFWorkflowActionParameters:{UUID:uid(),WFURL:p.url,WFHTTPMethod:"POST",ShowHeaders:true,WFHTTPHeaders:headers,...(p.body?{WFHTTPBodyType:"JSON",WFJSONValues:dict(p.body)}:{})}}
 ];
 const wf={WFWorkflowName:name,WFWorkflowActions:acts,WFWorkflowClientVersion:"4033.0.4.3",
 WFWorkflowMinimumClientVersion:900,WFWorkflowMinimumClientVersionString:"900",
 WFWorkflowHasShortcutInputVariables:false,WFWorkflowHasOutputFallback:false,WFWorkflowIcon:{WFWorkflowIconGlyphNumber:61440,WFWorkflowIconStartColor:4282601983},
 WFWorkflowImportQuestions:embeddedToken?[]:[{ActionIndex:0,Category:"Parameter",ParameterKey:"WFTextActionText",Text:"Токен Яндекса. Если токена нет: откройте https://mapkepp.github.io/tools/studio/ на iPhone → Войти через Яндекс → Скопировать токен → вернуться в Команды и вставить его сюда. Не делитесь этим токеном.",DefaultValue:""}],
 WFWorkflowInputContentItemClasses:["WFStringContentItem"],WFWorkflowOutputContentItemClasses:[],WFWorkflowTypes:["WFWorkflowTypeShowInSearch"],WFQuickActionSurfaces:[]};
 const content='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">'+xml(wf)+"</plist>";
 const safe=name.replace(/[^0-9A-Za-zА-Яа-яЁё _-]/g,"_").trim().slice(0,50)||"Yandex";
 return new File([content],safe+".shortcut",{type:"application/octet-stream"});
}
function save(blob){
 const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=blob.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),8000);
}
$("dataFile").addEventListener("change",async e=>{
 try{const f=e.target.files?.[0];if(!f)return;if(f.size>limit)throw Error("Файл больше 1,2 МБ.");loadRaw(await f.text());}catch(err){status("Ошибка файла: "+err.message,true);}
});
$("parseButton").addEventListener("click",()=>{try{loadRaw($("dataText").value);}catch(err){status("Не получилось прочитать список: "+err.message,true);}});
$("pasteButton").addEventListener("click",async()=>{try{const t=await navigator.clipboard.readText();loadRaw(t);}catch(e){status("Буфер обмена недоступен. Нажмите на поле «Есть JSON в буфере?» и вставьте текст вручную.",true);}});
$("demoButton").addEventListener("click",()=>{data=clone(demo);example=true;selected=null;render();status("Это демонстрационный дом. Команды для этих вымышленных устройств работать не будут.");$("search").value="";render();});
$("clearButton").addEventListener("click",()=>{data=null;selected=null;example=false;$("dataText").value="";$("dataFile").value="";$("actionArea").classList.remove("open");$("selected").textContent="Выберите объект слева.";render();status("Данные удалены из этой вкладки.");});
$("search").addEventListener("input",render);
$("actionSelect").addEventListener("change",()=>{renderInput();const a=currentAction();if(a)$("shortcutName").value=selected.obj.name+" — "+a.label.toLocaleLowerCase("ru");});
$("shortcutName").addEventListener("input",updatePreview);
$("downloadUnsigned").addEventListener("click",()=>{try{save(file());status("Сохранён неподписанный шаблон. iOS требует подпись для импорта.");}catch(e){status(e.message,true);}});
$("downloadSign").addEventListener("click",()=>{
 try{
  if(!$("signConsent").checked)throw Error("Подтвердите передачу шаблона без токена сервису подписи.");
  const output=file();const dt=new DataTransfer();dt.items.add(output);
  const form=document.createElement("form");form.method="POST";form.enctype="multipart/form-data";form.action=SIGN;form.target="_blank";form.hidden=true;
  const input=document.createElement("input");input.type="file";input.name="file";input.files=dt.files;form.append(input);document.body.append(form);form.submit();form.remove();
  status("Команда отправлена на подпись без токена. Проверьте открывшуюся вкладку и загрузки браузера.");
 }catch(e){status(e.message,true);}
});
// Only metadata about a chosen action goes into a share link. Never an OAuth token.
window.MapkeppStudio = Object.freeze({
 getShareData(){
   const r=request(), a=currentAction();
   const value = a.cap === "scenario" ? null : (selected.kind === "group" ? r.body.actions[0].state.value : r.body.devices[0].actions[0].state.value);
   return {v:1,k:selected.kind,id:selected.obj.id,n:selected.obj.name,t:$("shortcutName").value.trim(),
     c:a.cap,i:a.instance||"",value,
     ...(a.range?{range:{min:a.range.min,max:a.range.max,precision:a.range.precision||1}}:{}),
     ...(a.modes?{modes:a.modes.map(m=>m.value)}:{})};
 },
 restoreShare(o){
   if(!["device","group","scenario"].includes(o.k) || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(o.id)
    || typeof o.n!=="string" || !o.n.trim() || o.n.length>120
    || typeof o.t!=="string" || !o.t.trim() || o.t.length>60)throw Error("Некорректная ссылка на команду.");
   const kind=o.k;
   let capability=null;
   if(kind!=="scenario"){
     if(o.c==="on_off" && o.i==="on" && typeof o.value==="boolean"){
       capability={type:"devices.capabilities.on_off",parameters:{},state:{instance:"on",value:o.value}};
     }else if(["range","color_setting"].includes(o.c) && /^[a-z0-9_]{1,60}$/.test(o.i)
       && o.range && Number.isFinite(o.range.min) && Number.isFinite(o.range.max)
       && Number.isFinite(o.value) && o.value>=o.range.min && o.value<=o.range.max
       && o.range.max>o.range.min && o.range.max-o.range.min<=100000){
       const bounds={min:o.range.min,max:o.range.max,precision:o.range.precision||1};
       capability={type:"devices.capabilities."+o.c,
         parameters:o.c==="range"?{instance:o.i,range:bounds}:{temperature_k:bounds},
         state:{instance:o.i,value:o.value}};
     }else if(o.c==="mode" && /^[a-z0-9_]{1,60}$/.test(o.i)
       && Array.isArray(o.modes) && o.modes.length<=40
       && o.modes.every(m=>typeof m==="string"&&/^[a-zA-Z0-9_.-]{1,80}$/.test(m))
       && o.modes.includes(o.value)){
       capability={type:"devices.capabilities.mode",
         parameters:{instance:o.i,modes:o.modes.map(value=>({value}))},state:{instance:o.i,value:o.value}};
     }else throw Error("Недопустимое действие в ссылке.");
   }else if(o.c!=="scenario")throw Error("Некорректный сценарий.");
   const object={id:o.id,name:o.n,is_active:true,...(capability?{capabilities:[capability]}:{})};
   data={status:"ok",households:[{id:"shared",name:"Команда по ссылке"}],rooms:[],
     devices:kind==="device"?[{...object,household_id:"shared"}]:[],
     groups:kind==="group"?[{...object,household_id:"shared",devices:[]}]:[],
     scenarios:kind==="scenario"?[object]:[]};
   selected=null;example=false;$("search").value="";render();pick(kind,object);
   $("shortcutName").value=o.t;
   const possibilities=$("actionSelect")._actions||[];
   const option=possibilities.findIndex(a=>a.cap===o.c && a.instance===(o.i||"")
     && (a.cap!=="on_off" || a.value===o.value));
   if(option<0)throw Error("Действие в ссылке не поддерживается.");
   $("actionSelect").value=String(option);
   renderInput();
   if(o.c==="range"||o.c==="color_setting"||o.c==="mode")$("actionValue").value=String(o.value);
   updatePreview();
   status("Открыта подготовленная команда. Проверьте параметры и нажмите «Подписать и скачать». Для управления нужен токен аккаунта, имеющего доступ к выбранному устройству.");
 },
 signWithEmbeddedToken(){
   const token=$("oauthToken").value.trim().replace(/^Bearer\s+/i,"");
   if(!new RegExp("^[A-Za-z0-9_.~+/=-]{12,4096}$").test(token))throw Error("Вставьте действительный токен в поле Яндекса.");
   return file(token);
 },
 showStatus:status
});
initOAuth();
render();
})();