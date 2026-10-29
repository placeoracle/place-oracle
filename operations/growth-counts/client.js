(()=>{'use strict';
 const sites={'dog-stay-guide.pages.dev':'dog','kakegawa-stay-guide.pages.dev':'ecopa','placeoracle.github.io':'oracle'};
 const site=sites[location.hostname];if(!site||(site==='oracle'&&!location.pathname.startsWith('/place-oracle/')))return;
 const endpoint='https://three-sites-growth.place-oracle-info.workers.dev/collect';
 const key='growth_counts_disabled_v1';const oracleKey='placeoracle_analytics_consent_v2';
 const test=new URLSearchParams(location.search).get('growth_test')==='1';
 function allowed(){try{return !navigator.globalPrivacyControl&&navigator.doNotTrack!=='1'&&localStorage.getItem(key)!=='1'&&(site!=='oracle'||localStorage.getItem(oracleKey)==='accepted');}catch{return false;}}
 function source(){let host='';try{host=new URL(document.referrer).hostname;}catch{}const hint=new URLSearchParams(location.search).get('utm_source')||'';const raw=(hint+' '+host).toLowerCase();if(/instagram/.test(raw))return 'instagram';if(/threads/.test(raw))return 'threads';if(/facebook|fb\.com/.test(raw))return 'facebook';if(/twitter|(^|\.)t\.co|(^|\s)x(\.com)?($|\s)/.test(raw))return 'x';if(/note\.com|^note /.test(raw))return 'note';if(/google|bing|yahoo|duckduckgo/.test(raw))return 'search';return document.referrer?'other':'direct';}
 const originSource=source();let pageSent=false;
 function send(event){if(!allowed())return;const body=JSON.stringify({site,event,source:originSource,test});void fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true}).catch(()=>{});}
 function page(){if(!pageSent&&allowed()){pageSent=true;send('page_view');}}
 window.growthCount=function(event){if((site==='oracle'&&['start','result'].includes(event)))send(event);};
 function setup(){page();
  if(site!=='oracle'){
   const footer=document.querySelector('footer')||document.body;const p=document.createElement('p');p.style.cssText='font:12px/1.7 sans-serif;margin:16px 0';p.textContent='サイト改善のため、入力内容や個人識別子を含まない閲覧・操作件数をCloudflareで集計します。';const button=document.createElement('button');button.type='button';function label(){try{button.textContent=localStorage.getItem(key)==='1'?'操作件数の集計を有効にする':'操作件数の集計を停止する';}catch{button.textContent='操作件数の集計は無効です';}}label();button.addEventListener('click',()=>{try{localStorage.setItem(key,localStorage.getItem(key)==='1'?'0':'1');label();page();}catch{}});p.append(' ',button);footer.append(p);
   document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;let u;try{u=new URL(a.href,location.href);}catch{return;}if(u.pathname==='/api/book'||(u.hostname==='hb.afl.rakuten.co.jp')||u.hostname==='travel.rakuten.co.jp'||u.hostname==='hotel.travel.rakuten.co.jp')send('booking_click');});
   if(site==='dog')document.addEventListener('dog:search',()=>send('search'));
   if(site==='ecopa')document.addEventListener('ecopa:station',()=>send('search'));
  }else document.addEventListener('click',event=>{if(event.target.closest?.('.po-accept'))page();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
