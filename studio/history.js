"use strict";
(() => {
  const KEY="mapkepp.studio.local.shortcuts.v1";
  const MAX=30,MAX_BYTES=90000;
  const $=id=>document.getElementById(id);
  const container=$("historyList"),note=$("historyStatus");
  if(!container)return;
  const message=(m)=>{note.textContent=m;};
  const valid=c=>c && c.v===1 && ["device","group","scenario"].includes(c.k) &&
    typeof c.id==="string" && c.id.length>0 && c.id.length<=200 &&
    typeof c.n==="string" && c.n.length>0 && c.n.length<=120 &&
    typeof c.t==="string" && c.t.length>0 && c.t.length<=60 &&
    typeof c.c==="string" && /^[a-z_]{2,24}$/.test(c.c) &&
    !/token|password|secret|oauth|bearer/i.test(JSON.stringify(Object.keys(c))) &&
    JSON.stringify(c).length<2400;
  function read(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw)return [];
      if(raw.length>MAX_BYTES)throw Error("История повреждена или слишком велика.");
      const rows=JSON.parse(raw);
      if(!Array.isArray(rows)||rows.length>MAX)return [];
      return rows.filter(x=>valid(x?.config)&&typeof x.id==="string"&&typeof x.at==="string");
    }catch{message("Не удалось прочитать локальную историю: возможно, браузер запрещает хранение.");return [];}
  }
  function write(rows){
    const clean=rows.slice(0,MAX);
    const blob=JSON.stringify(clean);
    if(blob.length>MAX_BYTES)throw Error("История слишком велика.");
    localStorage.setItem(KEY,blob);
  }
  function render(){
    container.replaceChildren();
    const entries=read();
    if(entries.length===0){const p=document.createElement("p");p.className="hint";p.textContent="История пока пуста. Создайте команду и нажмите «Сохранить текущую команду».";container.append(p);return;}
    for(const record of entries){
      const row=document.createElement("div");
      row.className="flex";
      row.style.margin="9px 0";
      const title=document.createElement("span");
      title.style.flex="1";
      title.textContent=record.config.t+" · "+new Date(record.at).toLocaleDateString("ru-RU");
      const open=document.createElement("button");open.type="button";open.textContent="Открыть";
      open.addEventListener("click",()=>{
        try{window.MapkeppStudio.restoreShare(record.config);message("Настройки восстановлены. Токен не загружался из истории.");$("config").scrollIntoView({behavior:"smooth",block:"start"});}
        catch{message("Не получилось восстановить запись. Удалите повреждённую конфигурацию.");}
      });
      const del=document.createElement("button");del.type="button";del.textContent="Удалить";
      del.addEventListener("click",()=>{
        try{write(read().filter(x=>x.id!==record.id));render();message("Запись удалена только из этого браузера.");}
        catch(e){message(e.message);}
      });
      row.append(title,open,del);container.append(row);
    }
  }
  $("saveHistory").addEventListener("click",()=>{
    try{
      const config=window.MapkeppStudio.getShareData();
      if(!valid(config))throw Error("Не удалось подготовить параметры команды без токена.");
      const rows=read();
      const existing=rows.filter(x=>JSON.stringify(x.config)!==JSON.stringify(config));
      write([{id:crypto.randomUUID(),at:new Date().toISOString(),config},...existing]);
      render();message("Настройки сохранены локально. OAuth-токен не сохранялся.");
    }catch(e){message(e.message);}
  });
  $("exportHistory").addEventListener("click",()=>{
    const history=read();
    if(!history.length){message("Экспортировать пока нечего.");return;}
    const blob=new Blob([JSON.stringify({format:"mapkepp-shortcut-history-v1",items:history},null,2)],{type:"application/json"});
    const a=document.createElement("a");
    const url=URL.createObjectURL(blob);
    a.href=url;a.download="mapkepp-shortcuts-history.json";document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
    message("Экспорт содержит только настройки, без токенов.");
  });
  $("importHistory").addEventListener("change",async e=>{
    try{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>MAX_BYTES)throw Error("Файл больше допустимого размера.");
      const parsed=JSON.parse(await file.text());
      if(parsed?.format!=="mapkepp-shortcut-history-v1"||!Array.isArray(parsed.items))throw Error("Неподдерживаемый файл истории.");
      if(parsed.items.length>MAX)throw Error("В истории слишком много записей.");
      const items=parsed.items.filter(x=>valid(x?.config)).map(x=>({id:crypto.randomUUID(),at:new Date().toISOString(),config:x.config}));
      if(items.length!==parsed.items.length)throw Error("Файл содержит недопустимые настройки. Импорт остановлен.");
      write([...items,...read()].slice(0,MAX));render();message("Импортировано "+items.length+" настроек без токенов.");
    }catch(e){message("Импорт не выполнен: "+e.message);}
    finally{e.target.value="";}
  });
  $("deleteHistory").addEventListener("click",()=>{
    if(!window.confirm("Удалить все локально сохранённые настройки команд на этом устройстве?"))return;
    try{localStorage.removeItem(KEY);render();message("Локальная история удалена.");}
    catch{message("Не удалось очистить локальное хранилище.");}
  });
  render();
})();