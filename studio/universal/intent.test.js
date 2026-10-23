'use strict';
const assert=require('node:assert/strict'),{resolve}=require('./intent');
const ds=[{id:'lamp_1',name:'свет в спальне',capabilities:[{type:'devices.capabilities.on_off'},{type:'devices.capabilities.range',parameters:{instance:'brightness',range:{min:1,max:100}}}]},{id:'gate_1',name:'ворота',sensitive:true,capabilities:[{type:'devices.capabilities.on_off'}]}];
const tests=[['включи свет в спальне','ready'],['выключи свет в спальне','ready'],['свет в спальне на 40 процентов','ready'],['свет в спальне на 0 процентов','unsupported'],['свет в спальне на 101 процент','error'],['какое состояние свет в спальне','read'],['включи и выключи свет в спальне','clarify'],['открой ворота','clarify'],['включи ворота','confirm'],['включи неизвестное','clarify'],['свет в спальне на сорок процентов','ready'],['статус свет в спальне и включи','clarify']];
for(const [phrase,expected] of tests)assert.equal(resolve(phrase,ds).status,expected,phrase);
console.log('PASS 12 intent tests');
