"use strict";
(() => {
  // This module never reads OAuth, inventory, names, URLs, DOM input values
  // or account identifiers. It transmits only {page,event} from closed enums.
  const ENDPOINT="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/site-metrics";
  const page=location.pathname.includes("/studio/")?"studio":"home";
  const pageName=page==="home"?"Главная":"Студия";
  const output=document.getElementById("siteMetricsStatus");
  // Scrolling to donation must NOT replace #config in a QR/shared link.
  document.querySelector(".header-donate")?.addEventListener("click",event=>{
    const target=document.getElementById("donate");
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:"smooth",block:"start"});
  });

  const actions=new Set(["downloadSign","downloadUnsigned","loadDevices",
    "makeShare","exportInventoryFile","saveInventoryBrowser","parseButton",
    "saveHistory","exportHistory"]);
  const lastAction=new Map();
  if(!output)return;
  const fmt=x=>new Intl.NumberFormat("ru-RU").format(x);
  function render(summary){
    const own=summary?.pages?.[page],total=summary?.total;
    if(!own||!total||!["visits","uses"].every(k=>
      Number.isSafeInteger(own[k])&&Number.isSafeInteger(total[k])&&own[k]>=0&&total[k]>=0))return;
    const unique=x=>Number.isSafeInteger(x)&&x>=0?fmt(x):"—";
    output.textContent=pageName+": "+fmt(own.visits)+" просмотров · "+
      fmt(own.uses)+" действий · ≈"+unique(own.uniqueBrowsers)+
      " уникальных браузеров | Весь сайт: "+fmt(total.visits)+
      " просмотров · "+fmt(total.uses)+" действий · ≈"+
      unique(total.uniqueBrowsers)+" уникальных браузеров";
  }
  // Serialize counters so slower earlier responses cannot overwrite a newer
  // aggregate total on the page; failures never block later events.
  let updateChain=Promise.resolve();
  const send=event=>{
    const task=updateChain.then(()=>postEvent(event));
    updateChain=task.catch(()=>{});
    return task;
  };
  async function postEvent(event){
    try{
      const response=await fetch(ENDPOINT,{
        method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
        redirect:"error",referrerPolicy:"no-referrer",keepalive:true,
        headers:{"Content-Type":"text/plain;charset=UTF-8"},
        body:JSON.stringify({page,event})
      });
      if(!response.ok)throw Error("unavailable");
      const summary=await response.json();
      render(summary);
      return true;
    }catch{
      // Nonessential counters must never affect signing, OAuth or devices.
      if(output.textContent==="Счётчики загружаются…")
        output.textContent="Статистика временно недоступна";
      return false;
    }
  }
  async function read(){
    try{
      const response=await fetch(ENDPOINT,{
        method:"GET",mode:"cors",credentials:"omit",cache:"no-store",
        redirect:"error",referrerPolicy:"no-referrer"
      });
      if(response.ok)render(await response.json());
    }catch{output.textContent="Статистика временно недоступна";}
  }
  // An approximate unique browser count with NO permanent identifier:
  // only local first-party boolean flags. The server receives solely
  // {page,event:"unique_first"|"unique_page"}, never a browser fingerprint.
  // No storage = no counting. Clearing browser site data counts anew.
  function uniqueBrowserOnce(){
    const siteKey="mapkepp.metrics.unique.site.v1";
    const pageKey="mapkepp.metrics.unique.page."+page+".v1";
    let store,siteState,pageState,kind,mark;
    try{
      store=localStorage;
      siteState=store.getItem(siteKey);
      pageState=store.getItem(pageKey);
      if(pageState==="done")return;
      if(typeof pageState==="string"&&pageState.startsWith("pending:")&&
         Date.now()-Number(pageState.slice(8))<60000)return;
      kind=siteState==="done"||(
         typeof siteState==="string"&&siteState.startsWith("pending:")&&
         Date.now()-Number(siteState.slice(8))<60000
       )?"unique_page":"unique_first";
      mark="pending:"+Date.now();
      store.setItem(pageKey,mark);
      if(kind==="unique_first")store.setItem(siteKey,mark);
    }catch{return;}
    void send(kind).then(ok=>{
      try{
        if(ok){
          if(store.getItem(pageKey)===mark)store.setItem(pageKey,"done");
          if(kind==="unique_first"&&store.getItem(siteKey)===mark)
            store.setItem(siteKey,"done");
        }else{
          if(store.getItem(pageKey)===mark)store.removeItem(pageKey);
          if(kind==="unique_first"&&store.getItem(siteKey)===mark)
            store.removeItem(siteKey);
        }
      }catch{/* Tracking never blocks any product feature. */}
    });
  }
  uniqueBrowserOnce();
  let counted=false;
  try{
    const key="mapkepp.metrics.pageview."+page;
    const last=Number(sessionStorage.getItem(key)||0);
    if(!Number.isFinite(last)||Date.now()-last>30*60*1000||last>Date.now()){
      sessionStorage.setItem(key,String(Date.now()));
      counted=true;
    }
  }catch{counted=true;}
  if(counted)void send("visit");
  else void read();
  // Counter = interactions with main tools (not successful actions, and
  // not unique visitors). One event per action per 8s prevents double clicks.
  document.addEventListener("click",event=>{
    const el=event.target instanceof Element?event.target.closest("button[id]"):null;
    const id=el?.id;
    if(!actions.has(id))return;
    const now=Date.now(),previous=lastAction.get(id)||0;
    if(now-previous<8000)return;
    lastAction.set(id,now);
    void send("use");
  },true);
})();
