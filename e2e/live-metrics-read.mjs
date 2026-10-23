import assert from "node:assert/strict";
const endpoint="https://ogwcotyorlftmvlalzgc.supabase.co/functions/v1/site-metrics";
const headers={Origin:"https://mapkepp.github.io"};
const r=await fetch(endpoint,{headers,redirect:"error",signal:AbortSignal.timeout(15000)});
assert.equal(r.status,200,"Live Edge function must return aggregated counters");
const data=await r.json();
for(const page of ["home","studio"]){
 assert.ok(Number.isSafeInteger(data.pages[page].visits));
 assert.ok(Number.isSafeInteger(data.pages[page].uses));
 assert.ok(data.pages[page].visits>=0&&data.pages[page].uses>=0);
 assert.ok(Number.isSafeInteger(data.pages[page].uniqueBrowsers));
 assert.ok(data.pages[page].uniqueBrowsers>=0);
}
assert.equal(data.total.visits,data.pages.home.visits+data.pages.studio.visits);
assert.equal(data.total.uses,data.pages.home.uses+data.pages.studio.uses);
assert.ok(Number.isSafeInteger(data.total.uniqueBrowsers)&&data.total.uniqueBrowsers>=0);
const forbidden=await fetch(endpoint,{
 method:"POST",headers:{...headers,"Content-Type":"text/plain;charset=UTF-8"},
 body:JSON.stringify({page:"home",event:"use",device_name:"synthetic-not-real"}),
 redirect:"error",signal:AbortSignal.timeout(15000)
});
assert.equal(forbidden.status,400,"No user data fields may be accepted");
const attacker=await fetch(endpoint,{headers:{Origin:"https://not-mapkepp.invalid"},redirect:"error",signal:AbortSignal.timeout(15000)});
assert.equal(attacker.status,403,"Untrusted origins must be rejected");
console.log("PASS: production Supabase counters readable, private-field injection blocked and external origins rejected");
