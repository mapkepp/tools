"use strict";
(() => {
  // This module never reads OAuth, inventory, names, URLs, DOM input values
  // or account identifiers. It transmits only {page,event} from closed enums.
  const ENDPOINT="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/site-metrics";
  const page=location.pathname.includes("/studio/")?"studio":"home";
  const pageName=page==="home"?"Главная":"Студия";
  const output=document.getElementById("siteMetricsStatus");
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
    output.textContent=pageName+": "+fmt(own.visits)+" просмотров · "+
      fmt(own.uses)+" действий | Весь сайт: "+fmt(total.visits)+
      " просмотров · "+fmt(total.uses)+" действий";
  }
  async function send(event){
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
    }catch{
      // Nonessential counters must never affect signing, OAuth or devices.
      if(output.textContent==="Счётчики загружаются…")
        output.textContent="Статистика временно недоступна";
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
