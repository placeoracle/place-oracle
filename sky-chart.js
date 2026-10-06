/* PLACE ORACLE observed-sky chart.
   Bright-star positions: J2000 catalogue in sky-chart-data.js.
   Projection: observer latitude/longitude + selected local date/time -> altitude/azimuth.
   Weather, light pollution and terrain/building obstruction are intentionally not simulated. */
(function(){
  'use strict';
  const data=window.PO_SKY_DATA;
  const rad=Math.PI/180;
  const mod=(n,m)=>((n%m)+m)%m;

  const featuredConstellations=Object.freeze({
    orion:{label:'オリオン座',message:'まだ見えない方向へ、足を出す強さ。',paths:[[[88.7929,7.4069],[81.2829,6.3497],[85.1896,-1.9428],[83.0017,-.2992],[84.0533,-1.2019],[78.6346,-8.2017]],[[85.1896,-1.9428],[86.9392,-9.6697]],[[78.6346,-8.2017],[86.9392,-9.6697]]]},
    ursaMajor:{label:'おおぐま座',message:'目印を見失わず、少しずつ整える。',paths:[[[165.9321,61.7508],[165.4604,56.3825],[178.4575,53.6947],[183.9517,57.1133],[193.5071,55.9597],[200.9812,54.9253],[206.885,49.3133]]]},
    cassiopeia:{label:'カシオペヤ座',message:'形を変えながらも、自分の場所を保つ。',paths:[[[2.2946,59.1497],[10.1271,56.5372],[14.1771,60.7167],[21.4542,60.2353],[28.5989,63.6701]]]},
    scorpius:{label:'さそり座',message:'深い気持ちを、急がず言葉にする。',paths:[[[240.0833,-22.6217],[247.3517,-26.4319],[252.1662,-34.0742],[263.4021,-37.1039],[264.33,-42.9978]],[[247.3517,-26.4319],[241.3592,-19.8056],[229.2517,-9.3831]]]},
    crux:{label:'みなみじゅうじ座',message:'遠くても、進む方角を確かめる。',paths:[[[186.6496,-63.0992],[191.93,-59.6886],[187.7913,-57.1133]],[[191.93,-59.6886],[219.8996,-60.8353]]]},
    canisMajor:{label:'おおいぬ座',message:'ひとつの明るさを、帰る目印にする。',paths:[[[95.9879,-52.6958],[101.2871,-16.7161],[95.675,-17.9558],[107.0979,-26.3933],[104.6562,-28.9722],[111.0238,-29.3031]]]},
    pegasus:{label:'ペガスス座',message:'まだ選んでいない道を、空けておく。',paths:[[[346.1904,15.2053],[345.9438,28.0828],[2.0971,29.0906],[3.3089,15.1836],[346.1904,15.2053]],[[346.1904,15.2053],[326.0467,9.875]]]}
  });
  const sceneAffinity={alley:['pegasus','cassiopeia'],sea:['scorpius','canisMajor','crux'],light:['orion','cassiopeia','canisMajor'],green:['ursaMajor','cassiopeia','crux'],distance:['pegasus','ursaMajor','orion']};
  const themeAffinity={work:['orion','ursaMajor','pegasus'],people:['cassiopeia','canisMajor','ursaMajor'],love:['scorpius','orion','canisMajor'],life:['ursaMajor','cassiopeia','crux'],self:['cassiopeia','canisMajor','ursaMajor'],future:['pegasus','orion','crux']};

  function localDateTime(dateKey,timeZone,hour=21,minute=0){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||'')))return null;
    if(!Number.isFinite(hour)||!Number.isFinite(minute))return null;
    const [y,m,d]=dateKey.split('-').map(Number);
    const target=Date.UTC(y,m-1,d,hour,minute,0);
    const formatter=new Intl.DateTimeFormat('en-US',{
      timeZone,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    });
    let utc=target;
    for(let k=0;k<4;k++){
      const parts=Object.fromEntries(
        formatter.formatToParts(new Date(utc))
          .filter(p=>p.type!=='literal')
          .map(p=>[p.type,Number(p.value)])
      );
      const local=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
      const delta=target-local;
      utc+=delta;
      if(Math.abs(delta)<1000)break;
    }
    return new Date(utc);
  }

  function chartSpec(id,dateKey,hour=21,minute=0){
    const point=data&&data.coords&&data.coords[id];
    if(!point)return null;
    const date=localDateTime(dateKey,point[2],hour,minute);
    if(!date||Number.isNaN(+date))return null;
    const source=String(point[3]).startsWith('https://')
      ?point[3]
      :'https://whc.unesco.org/en/list/'+point[3]+'/maps/';
    return {
      id:String(id),dateKey,date,hour,minute,
      lat:Number(point[0]),lon:Number(point[1]),timeZone:point[2],
      source,reference:point[4]||'世界遺産の登録地点'
    };
  }

  function position(ra,dec,spec){
    const jd=spec.date.getTime()/86400000+2440587.5;
    const T=(jd-2451545)/36525;
    const lst=mod(
      280.46061837+
      360.98564736629*(jd-2451545)+
      .000387933*T*T-
      T*T*T/38710000+
      spec.lon,360
    )*rad;
    const h=lst-ra*rad,delta=dec*rad,phi=spec.lat*rad;
    const alt=Math.asin(
      Math.sin(phi)*Math.sin(delta)+
      Math.cos(phi)*Math.cos(delta)*Math.cos(h)
    );
    const az=mod(
      Math.atan2(
        -Math.sin(h)*Math.cos(delta),
        Math.sin(delta)*Math.cos(phi)-Math.cos(delta)*Math.sin(phi)*Math.cos(h)
      ),
      2*Math.PI
    );
    return {alt:alt/rad,az:az/rad};
  }

  function featuredConstellation(id,dateKey,hint={},hour=21){
    const spec=chartSpec(id,dateKey,hour,0);if(!spec)return null;
    const ranked=[...(sceneAffinity[hint.scene]||[]),...(themeAffinity[hint.theme]||[])];
    const candidates=Object.entries(featuredConstellations).map(([key,item])=>{
      const points=item.paths.flat();
      const alts=points.map(([ra,dec])=>position(ra,dec,spec).alt);
      const visible=alts.filter(alt=>alt>5).length/alts.length;
      const average=alts.reduce((sum,alt)=>sum+Math.max(alt,0),0)/alts.length;
      const rank=ranked.indexOf(key),affinity=rank<0?0:28-rank*6;
      return {id:key,...item,visible,average,score:visible*100+average+affinity};
    }).filter(item=>item.visible>=.65).sort((x,y)=>y.score-x.score);
    return candidates[0]||null;
  }

  function drawPath(ctx,path,projected,stroke,width,alpha=1){
    let open=false;
    ctx.beginPath();
    for(const [ra,dec] of path){
      const p=projected(ra,dec);
      if(p.alt<=0){open=false;continue}
      if(open)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
      open=true;
    }
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=width;
    ctx.lineJoin='round';
    ctx.lineCap='round';
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  function draw(ctx,id,dateKey,cx,cy,r,focus,hour=21){
    const spec=chartSpec(id,dateKey,hour,0);if(!spec||!ctx)return null;
    const projected=(ra,dec)=>{
      const p=position(ra,dec,spec);
      const radius=r*(90-p.alt)/90;
      const az=p.az*rad;
      return {x:cx+radius*Math.sin(az),y:cy-radius*Math.cos(az),alt:p.alt,az:p.az};
    };

    ctx.save();
    const bg=ctx.createRadialGradient(cx,cy,4,cx,cy,r);
    bg.addColorStop(0,'#263f57');
    bg.addColorStop(.62,'#142c40');
    bg.addColorStop(1,'#071a28');
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();ctx.clip();

    for(const alt of [30,60]){
      ctx.beginPath();ctx.arc(cx,cy,r*(90-alt)/90,0,Math.PI*2);
      ctx.lineWidth=1;ctx.strokeStyle='rgba(220,231,230,.18)';ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);
    ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);
    ctx.strokeStyle='rgba(220,231,230,.13)';ctx.lineWidth=1;ctx.stroke();

    if(Array.isArray(data.lines)){
      for(const path of data.lines)drawPath(ctx,path,projected,'#8ea9b7',Math.max(.6,r*.0025),.16);
    }

    for(const star of data.stars||[]){
      const [ra,dec,mag,name]=star,p=projected(ra,dec);
      if(p.alt<=0)continue;
      const size=Math.max(.55,4.2-mag*.56);
      ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);
      ctx.globalAlpha=mag>3.2?.32:mag>2.4?.58:1;
      ctx.fillStyle=mag<1.5?'#ffe1a1':'#edf4ed';ctx.fill();ctx.globalAlpha=1;
      if(name&&mag<=1.05&&p.alt>7){
        ctx.font=Math.max(10,r*.032)+'px system-ui,sans-serif';
        ctx.fillStyle='rgba(237,244,237,.78)';
        ctx.textAlign='left';ctx.textBaseline='middle';
        ctx.fillText(name,p.x+size+3,p.y);
      }
    }

    if(focus){
      for(const path of focus.paths){
        drawPath(ctx,path,projected,'rgba(5,18,29,.96)',Math.max(7,r*.024),1);
        drawPath(ctx,path,projected,'#f4cd79',Math.max(3.2,r*.012),1);
      }
      for(const [ra,dec] of focus.paths.flat()){
        const p=projected(ra,dec);if(p.alt<=0)continue;
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,r*.018),0,Math.PI*2);
        ctx.fillStyle='#fff0be';ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle='rgba(236,219,174,.86)';ctx.lineWidth=2;ctx.stroke();
    ctx.font='600 '+Math.max(12,r*.055)+'px system-ui,sans-serif';
    ctx.fillStyle='#f2dfb1';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [label,dx,dy] of [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]]){
      ctx.fillText(label,cx+dx*r*.92,cy+dy*r*.92);
    }
    ctx.font='500 '+Math.max(10,r*.036)+'px system-ui,sans-serif';
    ctx.fillStyle='rgba(226,235,233,.72)';
    ctx.fillText('天頂',cx,cy);
    if(focus){
      ctx.font='700 '+Math.max(16,r*.068)+'px system-ui,sans-serif';
      ctx.fillStyle='#fff0bd';ctx.strokeStyle='rgba(5,18,29,.92)';ctx.lineWidth=4;
      ctx.strokeText(focus.label,cx,cy-r*.68);ctx.fillText(focus.label,cx,cy-r*.68);
    }
    ctx.restore();
    return spec;
  }

  function preview(canvas,id,dateKey,hint={},hour=21){
    if(!canvas)return false;
    const spec=chartSpec(id,dateKey,hour,0);
    canvas.hidden=!spec;if(!spec)return false;
    const focus=featuredConstellation(id,dateKey,hint,hour);
    draw(canvas.getContext('2d'),id,dateKey,canvas.width/2,canvas.height/2,canvas.width*.43,focus,hour);
    return {spec,focus};
  }

  window.PO_SKY_CHART={chartSpec,position,draw,preview,featuredConstellation,localDateTime};
})();