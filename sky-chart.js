/* Observed sky chart: positions from a J2000 bright-star catalogue, projected at 21:00 local time. */
(function(){
  'use strict';
  const data=window.PO_SKY_DATA;
  const rad=Math.PI/180;
  const mod=(n,m)=>((n%m)+m)%m;
  function localDateAt21(dateKey,timeZone){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||'')))return null;
    const [y,m,d]=dateKey.split('-').map(Number),target=Date.UTC(y,m-1,d,21);
    if(!Number.isFinite(target))return null;
    const formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    let utc=target;
    for(let k=0;k<3;k++){
      const part=Object.fromEntries(formatter.formatToParts(new Date(utc)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
      const local=Date.UTC(part.year,part.month-1,part.day,part.hour,part.minute,part.second);
      utc+=target-local;
    }
    return new Date(utc);
  }
  function chartSpec(id,dateKey){
    const point=data&&data.coords[id];if(!point)return null;
    const date=localDateAt21(dateKey,point[2]);if(!date||Number.isNaN(+date))return null;
    return {id,dateKey,date,lat:point[0],lon:point[1],timeZone:point[2],source:'https://whc.unesco.org/en/list/'+point[3]+'/maps/'};
  }
  function position(ra,dec,spec){
    const jd=spec.date.getTime()/86400000+2440587.5,T=(jd-2451545)/36525;
    const lst=mod(280.46061837+360.98564736629*(jd-2451545)+.000387933*T*T-T*T*T/38710000+spec.lon,360)*rad;
    const h=lst-ra*rad,delta=dec*rad,phi=spec.lat*rad;
    const alt=Math.asin(Math.sin(phi)*Math.sin(delta)+Math.cos(phi)*Math.cos(delta)*Math.cos(h));
    const az=mod(Math.atan2(-Math.sin(h)*Math.cos(delta),Math.sin(delta)*Math.cos(phi)-Math.cos(delta)*Math.sin(phi)*Math.cos(h)),2*Math.PI);
    return {alt:alt/rad,az};
  }
  function draw(ctx,id,dateKey,cx,cy,r){
    const spec=chartSpec(id,dateKey);if(!spec||!ctx)return null;
    const projected=(ra,dec)=>{
      const p=position(ra,dec,spec);
      const radius=r*(90-p.alt)/90;
      return {x:cx+radius*Math.sin(p.az),y:cy-radius*Math.cos(p.az),alt:p.alt};
    };
    ctx.save();
    const bg=ctx.createRadialGradient(cx,cy,4,cx,cy,r);
    bg.addColorStop(0,'#223f57');bg.addColorStop(1,'#081d2b');
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();
    ctx.clip();
    for(const alt of [30,60]){
      ctx.beginPath();ctx.arc(cx,cy,r*(90-alt)/90,0,Math.PI*2);
      ctx.lineWidth=1;ctx.strokeStyle='rgba(220,231,230,.18)';ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);
    ctx.strokeStyle='rgba(220,231,230,.13)';ctx.stroke();
    ctx.strokeStyle='rgba(214,191,147,.53)';ctx.lineWidth=1.4;
    for(const line of data.lines){
      let open=false;ctx.beginPath();
      for(const [ra,dec] of line){
        const p=projected(ra,dec);
        if(p.alt<=0){open=false;continue}
        if(open)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
        open=true;
      }
      ctx.stroke();
    }
    const labels=[];
    for(const [ra,dec,mag,name] of data.stars){
      const p=projected(ra,dec);if(p.alt<=0)continue;
      const size=Math.max(.7,3.4-mag*.48);
      ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);
      ctx.fillStyle=mag<1.5?'#ffe5b0':'#edf4ed';ctx.fill();
      if(name&&mag<1.4)labels.push({name,mag,p});
    }
    labels.sort((a,b)=>a.mag-b.mag);
    ctx.font=Math.max(10,r*.037)+'px system-ui,sans-serif';
    ctx.fillStyle='#e9e4d5';
    for(const {name,p} of labels.slice(0,8)){
      if(Math.hypot(p.x-cx,p.y-cy)>r*.83)continue;
      ctx.fillText(name,p.x+7,p.y-7);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle='rgba(236,219,174,.85)';ctx.lineWidth=2;ctx.stroke();
    ctx.font='600 '+Math.max(12,r*.055)+'px system-ui,sans-serif';
    ctx.fillStyle='#f2dfb1';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [label,dx,dy] of [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]])
      ctx.fillText(label,cx+dx*r*.92,cy+dy*r*.92);
    ctx.restore();
    return spec;
  }
  function preview(canvas,id,dateKey){
    if(!canvas)return false;
    const spec=chartSpec(id,dateKey);
    canvas.hidden=!spec;
    if(!spec)return false;
    return !!draw(canvas.getContext('2d'),id,dateKey,canvas.width/2,canvas.height/2,canvas.width*.43);
  }
  window.PO_SKY_CHART={chartSpec,position,draw,preview};
})();
