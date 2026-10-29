import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import worker from './worker.mjs';
let rows=[];const env={COUNTS:{prepare(sql){return {bind(...args){return {async run(){rows.push(args);}}}}}}};
const origin='https://dog-stay-guide.pages.dev';
const request=(body,headers={})=>new Request('https://collector/collect',{method:'POST',headers:{Origin:origin,...headers},body:JSON.stringify(body)});
const payload={site:'dog',event:'search',source:'instagram',test:true};
assert.equal((await worker.fetch(request(payload),env)).status,204);assert.equal(rows.length,1);
for(const p of [{...payload,birth:'2000-01-01'},{...payload,site:'oracle'},{...payload,event:'birth'},{...payload,source:'a private URL'}])assert.equal((await worker.fetch(request(p),env)).status,400);
assert.equal((await worker.fetch(request(payload,{Origin:'https://evil.example'}),env)).status,403);
assert.equal((await worker.fetch(request(payload,{DNT:'1'}),env)).status,204);assert.equal(rows.length,1);
assert.equal((await worker.fetch(new Request('https://collector/collect',{method:'POST',headers:{Origin:origin},body:'x'.repeat(257)}),env)).status,413);
assert.equal((await worker.fetch(new Request('https://collector/collect',{headers:{Origin:origin}}),env)).status,405);
const code=readFileSync(new URL('./client.js',import.meta.url),'utf8');
function browser(host,consent='rejected',dnt='0'){
 const sent=[],handlers={},stored=new Map([['placeoracle_analytics_consent_v2',consent]]);
 const footer={append(){}};const doc={referrer:'https://www.instagram.com/',readyState:'complete',querySelector:s=>s==='footer'?footer:null,body:footer,addEventListener:(n,fn)=>handlers[n]=fn,createElement:()=>({style:{},append(){},addEventListener(){}})};
 const context={location:{hostname:host,pathname:'/place-oracle/',search:'?growth_test=1'},navigator:{doNotTrack:dnt},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},document:doc,URL,URLSearchParams,fetch:async(u,opt)=>sent.push(JSON.parse(opt.body)),window:{}};
 vm.runInNewContext(code,context);return {sent,context,handlers};
}
const blocked=browser('placeoracle.github.io');blocked.context.window.growthCount('start');assert.equal(blocked.sent.length,0);
const accepted=browser('placeoracle.github.io','accepted');accepted.context.window.growthCount('start');accepted.context.window.growthCount('result');assert.deepEqual(accepted.sent.map(x=>x.event),['page_view','start','result']);
assert.equal(browser('dog-stay-guide.pages.dev','accepted','1').sent.length,0);
const dog=browser('dog-stay-guide.pages.dev');assert.equal(dog.sent[0].source,'instagram');assert.deepEqual(Object.keys(dog.sent[0]).sort(),['event','site','source','test']);
console.log('PASS: origin, schema, input rejection, body limit, DNT, consent and event-only client payloads');
