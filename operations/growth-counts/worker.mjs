const origins = Object.freeze({'https://dog-stay-guide.pages.dev':'dog','https://kakegawa-stay-guide.pages.dev':'ecopa','https://placeoracle.github.io':'oracle'});
const events = Object.freeze({dog:['page_view','search','booking_click'],ecopa:['page_view','search','booking_click'],oracle:['page_view','start','result']});
const sources = new Set(['instagram','threads','facebook','x','note','search','direct','other']);
export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return Response.json({ok:true,version:'2026-10-30-v1'});
  const origin=request.headers.get('Origin');const site=origins[origin];
  const headers={'Access-Control-Allow-Origin':origin||'null','Vary':'Origin','Cache-Control':'no-store'};
  if(!site||url.pathname!=='/collect')return new Response(null,{status:403});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return new Response(null,{status:405,headers});
  if(request.headers.get('Sec-GPC')==='1'||request.headers.get('DNT')==='1')return new Response(null,{status:204,headers});
  if(!request.body||Number(request.headers.get('Content-Length')||0)>256)return new Response(null,{status:413,headers});
  const reader=request.body.getReader();let length=0;const parts=[];
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>256){await reader.cancel();return new Response(null,{status:413,headers});}parts.push(value);}
  let body;try{const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return new Response(null,{status:400,headers});}
  if(!body||Object.keys(body).some(k=>!['site','event','source','test'].includes(k))||body.site!==site||!events[site].includes(body.event)||!sources.has(body.source)||typeof body.test!=='boolean')return new Response(null,{status:400,headers});
  const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  try{
   await env.COUNTS.prepare('INSERT INTO daily_counts(day,site,event,source,is_test,n) VALUES(?,?,?,?,?,1) ON CONFLICT(day,site,event,source,is_test) DO UPDATE SET n=MIN(n+1,10000)').bind(day,site,body.event,body.source,Number(body.test)).run();
   return new Response(null,{status:204,headers});
  }catch{return new Response(null,{status:503,headers});}
 }
};
