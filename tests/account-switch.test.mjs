import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const read = name => readFile(new URL("../"+name, import.meta.url), "utf8");

test("Yandex OAuth account switch discards old token and forces account selection", async () => {
  const app = await read("studio/app.js");
  const html = await read("studio/index.html");
  const listeners = new Map();
  const elements = new Map();
  const store = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id,{
      id,value:"",checked:false,hidden:false,href:"",
      textContent:"",style:{},classList:{add(){},remove(){},toggle(){}},
      addEventListener(type,fn){listeners.set(id+":"+type,fn);},
      replaceChildren(){},append(){},removeAttribute(){},scrollIntoView(){},
      getAttribute(){return null;},setAttribute(){},
      options:[],add(){},querySelectorAll(){return [];}
    });
    return elements.get(id);
  }
  const oauthHref = html.match(/href="([^"]+)" id="yandexAuth"/)?.[1]?.replaceAll("&amp;","&");
  assert.ok(oauthHref?.startsWith("https://oauth.yandex.ru/authorize?"));
  element("yandexAuth").href=oauthHref;
  element("oauthToken").value="synthetic-OLD-token-123456";
  element("loginHint").value="another_user@yandex.ru";
  element("proxyConsent").checked=true;
  store.set("mapkepp.yandex.oauth.tmp","synthetic-STALE-token-123456");
  const redirects=[];
  const sessionStorage = {
    getItem(key){return store.get(key)??null;},
    setItem(key,v){store.set(key,String(v));},
    removeItem(key){store.delete(key);}
  };
  const browser = {
    window:{MAPKEPP_HOME_API_URL:"https://example.supabase.co/functions/v1/yandex-home",innerWidth:1024},
    document:{
      getElementById:element,
      createElement(){return {className:"",textContent:"",append(){},setAttribute(){},classList:{add(){}}};},
      querySelectorAll(){return [];}
    },
    sessionStorage,
    location:{hash:"",origin:"https://mapkepp.github.io",pathname:"/tools/studio/",assign(url){redirects.push(url);}},
    crypto:{getRandomValues(bytes){bytes.fill(7);return bytes;}},
    URL,URLSearchParams,
    queueMicrotask(){},
    console
  };
  vm.runInNewContext(app,browser,{timeout:3000});
  assert.equal(typeof listeners.get("switchYandexAccount:click"),"function");
  listeners.get("switchYandexAccount:click")();
  assert.equal(redirects.length,1);
  const url=new URL(redirects[0]);
  assert.equal(url.origin,"https://oauth.yandex.ru");
  assert.equal(url.searchParams.get("response_type"),"token");
  assert.equal(url.searchParams.get("force_confirm"),"yes");
  assert.equal(url.searchParams.get("login_hint"),"another_user@yandex.ru");
  assert.equal(url.searchParams.get("redirect_uri"),"https://mapkepp.github.io/tools/oauth/callback.html");
  assert.equal(url.searchParams.get("state")?.length,48);
  assert.equal(element("oauthToken").value,"");
  assert.equal(store.has("mapkepp.yandex.oauth.tmp"),false);
  assert.equal(element("accountInfo").hidden,true);
  assert.equal(store.get("mapkepp.yandex.oauth.consent"),"yes");
});

test("no token is declared validated before the Yandex API returns success", async () => {
  const app=await read("studio/app.js");
  const callback=await read("oauth/callback.html");
  assert.match(app,/Токен получен от Яндекса, но ещё не проверен по API/);
  assert.match(app,/tokenCheck\("Токен подтверждён API Яндекс Умного дома/);
  assert.match(app,/Выбрать другой аккаунт/);
  assert.match(callback,/invalidToken/);
  assert.match(callback,/expires_in/);
  assert.match(callback,/iot:view/);
  const inline=callback.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.doesNotThrow(()=>new vm.Script(inline));
});
