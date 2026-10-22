"use strict";
(() => {
  const CLIENT_ID = "e5942ee8886149dfadc84fa3bc89049a";
  const CALLBACK = "https://mapkepp.github.io/tools/oauth/callback.html";
  const SDK_URL = "https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js";
  const $ = id => document.getElementById(id);
  const trigger = $("showYandexWidget");
  const status = $("yandexWidgetStatus");
  if (!trigger || !status) return;
  let busy=false, ready=false;
  const message = value => { status.textContent=value; };

  function fetchSdk() {
    return new Promise((resolve,reject)=>{
      if(typeof window.YaAuthSuggest?.init === "function")return resolve();
      const script=document.createElement("script");
      script.src=SDK_URL;
      script.async=true;
      script.referrerPolicy="no-referrer";
      script.onload=()=>typeof window.YaAuthSuggest?.init==="function"
        ?resolve():reject(new Error("missing_sdk"));
      script.onerror=()=>reject(new Error("sdk_blocked"));
      document.head.appendChild(script);
    });
  }
  function accept(data) {
    // Only use the SDK-returned token. Never log it or save it in a URL.
    const token=typeof data?.access_token==="string"?data.access_token:
      typeof data?.data?.access_token==="string"?data.data.access_token:"";
    if(!/^[A-Za-z0-9_.~+\/=-]{12,4096}$/.test(token)){
      message("Яндекс не предоставил действительный токен. Используйте обычный вход.");
      return;
    }
    const input=$("oauthToken");
    input.value=token;
    input.readOnly=true;
    input.type="password";
    input.dispatchEvent(new Event("input",{bubbles:true}));
    const check=$("tokenCheck");
    if(check)check.textContent="Токен Яндекс ID получен, но ещё не проверен на доступ к устройствам.";
    message("Яндекс ID подключён. Для загрузки устройств подтвердите разрешение и нажмите «Загрузить мои устройства».");
    if($("proxyConsent")?.checked)$("loadDevices")?.click();
  }
  async function mount() {
    if(busy || ready)return;
    busy=true;
    trigger.disabled=true;
    message("Проверяем доступность персональной кнопки Яндекс ID…");
    try{
      await fetchSdk();
      const suggest=await window.YaAuthSuggest.init({
        client_id:CLIENT_ID,response_type:"token",redirect_uri:CALLBACK,
        scope:"iot:view iot:control"
      },window.location.origin,{
        view:"button",parentId:"yandexButtonContainer",
        buttonView:"main",buttonTheme:"dark",buttonSize:"l",buttonBorderRadius:10
      });
      if(suggest?.status==="error" || typeof suggest?.handler!=="function")throw new Error("button_unavailable");
      ready=true;
      trigger.hidden=true;
      message("Кнопка Яндекс ID готова. Если Яндекс уже знает ваш аккаунт, он может показать его имя и фотографию прямо на кнопке.");
      // Do not await here: this Promise may resolve only after the user taps
      // the Yandex button. It must not block the site's other controls.
      Promise.resolve().then(()=>suggest.handler()).then(accept).catch(()=>{
        message("Авторизация кнопкой Яндекс ID отменена или недоступна. Обычный вход работает отдельно.");
      });
    }catch{
      message("Не удалось показать персональную кнопку. Некоторые браузеры ограничивают cookie Яндекса — используйте обычный вход ниже.");
    }finally{
      busy=false;
      trigger.disabled=false;
    }
  }
  trigger.addEventListener("click",mount);
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",mount,{once:true});
  else queueMicrotask(mount);
})();