"use strict";
(() => {
const $=id=>document.getElementById(id);
const limit=1200000;
let data=null, selected=null, example=false;
const API="https://api.iot.yandex.net/v1.0";
const SIGN="https://sign.shortcuty.app/api/v1/sign";
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
 status("Данные загружены локально: "+o.households.length+" домов, "+o.rooms.length+" комнат, "+count+" объектов. Токен на сайт не передавался.");
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
function file(){
 const p=request(),name=$("shortcutName").value.trim();
 if(!name||name.length>60)throw Error("Введите название команды до 60 символов.");
 const id=uid(),headers=dict(p.body?{"Content-Type":"application/json"}:{});
 headers.Value.WFDictionaryFieldValueItems.push({WFKey:tt("Authorization"),WFItemType:0,WFValue:tt("Bearer \uFFFC",{"{7, 1}":{Type:"ActionOutput",OutputUUID:id,OutputName:"Text"}})});
 const acts=[
 {WFWorkflowActionIdentifier:"is.workflow.actions.gettext",WFWorkflowActionParameters:{UUID:id,WFTextActionText:"YANDEX_OAUTH_TOKEN"}},
 {WFWorkflowActionIdentifier:"is.workflow.actions.downloadurl",WFWorkflowActionParameters:{UUID:uid(),WFURL:p.url,WFHTTPMethod:"POST",ShowHeaders:true,WFHTTPHeaders:headers,...(p.body?{WFHTTPBodyType:"JSON",WFJSONValues:dict(p.body)}:{})}}
 ];
 const wf={WFWorkflowName:name,WFWorkflowActions:acts,WFWorkflowClientVersion:"4033.0.4.3",
 WFWorkflowMinimumClientVersion:900,WFWorkflowMinimumClientVersionString:"900",
 WFWorkflowHasShortcutInputVariables:false,WFWorkflowHasOutputFallback:false,WFWorkflowIcon:{WFWorkflowIconGlyphNumber:61440,WFWorkflowIconStartColor:4282601983},
 WFWorkflowImportQuestions:[{ActionIndex:0,Category:"Parameter",ParameterKey:"WFTextActionText",Text:"Введите OAuth-токен Яндекса без слова Bearer (на iPhone)",DefaultValue:""}],
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
render();
})();