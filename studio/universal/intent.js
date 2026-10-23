'use strict';
const normalize=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
const wordNumbers={ноль:0,десять:10,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100};
function resolve(utterance,devices){
 const text=normalize(utterance);
 if(!Array.isArray(devices)||devices.length>250)return {status:'error',reason:'invalid_catalog'};
 const matched=devices.filter(d=>d&&typeof d.name==='string'&&normalize(d.name).length>0&&text.includes(normalize(d.name)));
 if(matched.length!==1)return {status:'clarify',reason:matched.length?'ambiguous_device':'unknown_device'};
 const d=matched[0];
 if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(String(d.id))||!Array.isArray(d.capabilities))return {status:'error',reason:'invalid_device'};
 const read=/(?:статус|состояние|включен|включена|работает|сколько|какая температура)/.test(text);
 const on=/(?:^| )(?:включи|зажги)(?: |$)/.test(text),off=/(?:^| )(?:выключи|погаси|отключи)(?: |$)/.test(text);
 const pct=text.match(/(?:^| )(\d{1,3})\s*(?:%|процент(?:а|ов)?)(?= |$)/);
 const wordPct=Object.entries(wordNumbers).find(([w])=>text.includes(w+' процент'));
 const percentage=pct?Number(pct[1]):wordPct?wordPct[1]:null;
 if((read&&(on||off||percentage!==null))||(on&&off))return {status:'clarify',reason:'contradictory_intent'};
 if(read)return {status:'read',device_id:d.id,endpoint:'/v1.0/devices/'+encodeURIComponent(d.id),method:'GET',scope:'iot:view'};
 let action;
 if(percentage!==null){if(percentage<0||percentage>100)return {status:'error',reason:'percentage_out_of_range'};action={type:'devices.capabilities.range',state:{instance:'brightness',value:percentage}};}
 else if(on||off)action={type:'devices.capabilities.on_off',state:{instance:'on',value:on}};
 else return {status:'clarify',reason:'unknown_action'};
 const supported=d.capabilities.some(c=>c.type===action.type&&(!c.parameters?.instance||c.parameters.instance===action.state.instance)&&(!c.parameters?.range||(action.state.value>=c.parameters.range.min&&action.state.value<=c.parameters.range.max)));
 if(!supported)return {status:'unsupported',reason:'capability_not_available'};
 const sensitive=d.sensitive===true||/(ворот|замок|двер|гараж|сирен|котел)/.test(normalize(d.name));
 return {status:sensitive?'confirm':'ready',device_id:d.id,method:'POST',endpoint:'/v1.0/devices/actions',scope:'iot:control',body:{devices:[{id:d.id,actions:[action]}]}};
}
if(typeof module!=='undefined')module.exports={resolve,normalize};
