(() => {
  'use strict';
  const TRIAL='po_trial_readings_v1', PENDING='po_pending_letter_v1';
  let busy=false;
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const put=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));};
  if(!localStorage.getItem(TRIAL)) {
    const legacy=get('place_oracle_v5_profile',null);
    try{put(TRIAL,{version:1,readings:legacy?.firstSeen?[{id:legacy.readingId||'legacy-first',snapshot:null}]:[]});}catch{}
  }
  function snapshot(reading) {
    const result={};
    for(const key of ['date','title','intro','sceneLine','heart','action','place','scene','theme','cycle','first','dailyCard']) result[key]=reading[key];
    // Raw birth, birthplace and personal notes never leave the browser.
    result.basis=reading.basis||'';
    result.sky=reading.sky||null;
    return JSON.parse(JSON.stringify(result));
  }
  function createPanel() {
    const panel=document.createElement('dialog');panel.id='poLetterAccess';panel.className='po-letter-access';
    panel.innerHTML=`<button type="button" class="dialog-close" aria-label="閉じる">×</button>
      <span class="eyebrow">ANOTHER LETTER</span><h2>もう一通、<br>景色からの手紙を。</h2>
      <p id="poLetterMessage"></p><div class="po-letter-choices">
      <button type="button" data-letter-plan="single">この一通を受け取る <small>100円・自動更新なし</small></button>
      <button type="button" data-letter-plan="monthly">日々の景色を楽しむ <small>月額500円・1日5通まで</small></button></div>
      <details><summary>年払いについて</summary><p>年額5,000円で、1日5通まで。1年ごとに自動更新されます。</p><button type="button" data-letter-plan="yearly">年払いを選ぶ</button></details>
      <button type="button" class="text-button" id="poLetterResume">ログイン・支払い状態を確認して受け取る</button>
      <button type="button" class="text-button" id="poLetterHistory">これまでの手紙を読む</button>
      <p class="po-letter-note">有料利用にはGoogleログインが必要です。お支払いの前に内容を確認できます。読み返しに追加料金はかかりません。</p>`;
    document.body.append(panel);
    panel.querySelector('.dialog-close').onclick=()=>panel.close();
    panel.querySelectorAll('[data-letter-plan]').forEach(button=>button.onclick=()=>{
      panel.close();window.dispatchEvent(new CustomEvent('placeoracle:purchase',{detail:{plan:button.dataset.letterPlan}}));
    });
    panel.querySelector('#poLetterResume').onclick=()=>{panel.close();window.dispatchEvent(new Event('placeoracle:resume-letter'));};
    panel.querySelector('#poLetterHistory').onclick=()=>{panel.close();showHistory();};
    return panel;
  }
  let panel;
  function explain(message) {
    panel ||= createPanel();panel.querySelector('#poLetterMessage').textContent=message;
    const receiving=message.startsWith('おかえりなさい');
    panel.querySelector('.po-letter-choices').hidden=message.includes('5通')||receiving;
    panel.querySelector('details').hidden=message.includes('5通')||receiving;
    panel.querySelector('#poLetterResume').textContent=receiving?'手紙を受け取る':'ログイン済みの方・購入済みの方はこちら';
    panel.querySelector('.po-letter-note').textContent=message.includes('5通')?'これまでに受け取った手紙は、いつでも追加料金なしで読み返せます。':receiving?'同じお支払いをやり直す必要はありません。確認できた一通を、そのままお届けします。':'有料利用にはGoogleログインが必要です。お支払いの前に内容を確認できます。読み返しに追加料金はかかりません。';
    if(!panel.open)panel.showModal();
  }
  async function authorize(id,reading) {
    if(busy)return null;busy=true;
    try {
      const draft=snapshot(reading);
      const trial=get(TRIAL,{readings:[]});
      const old=trial.readings.find(row=>row.id===id);
      if(old)return old.snapshot||draft;
      const signedIn=window.PlaceOracleAuth?.token?await window.PlaceOracleAuth.currentUser():null;
      const reserveTrial=()=>{
        if(signedIn?.reading_balance?.member)return null;
        const state=get(TRIAL,{version:1,readings:[]});
        const existing=state.readings.find(row=>row.id===id);
        if(existing)return existing.snapshot||draft;
        if(state.readings.length>=2)return null;
        state.readings.push({id,snapshot:draft});put(TRIAL,state);return draft;
      };
      // Serialize browser tabs, so two simultaneous trials cannot overwrite the count.
      const free=navigator.locks?await navigator.locks.request('placeoracle-trial',reserveTrial):reserveTrial();
      if(free){localStorage.removeItem(PENDING);return free;}
      put(PENDING,{id,snapshot:draft});
      const auth=window.PlaceOracleAuth;
      if(!auth){explain('接続の準備ができませんでした。少し待って、もう一度お試しください。');return null;}
      const me=await auth.currentUser();
      if(!me.authenticated){explain('はじめの2通をお届けしました。続きは、一通ずつでも、日々の楽しみとしても。');return null;}
      const result=await auth.createReading(id,draft);
      localStorage.removeItem(PENDING);
      localStorage.removeItem('po_checkout_attempt_single');
      window.dispatchEvent(new CustomEvent('placeoracle:balance',{detail:result.balance}));
      return result.snapshot;
    } catch(error) {
      if(error.status===401) explain('手紙の続きは、もう一度Googleでログインしてからお受け取りください。');
      else if(error.body?.reason==='daily_limit') explain('今日は5通の手紙をお届けしました。日本時間の午前0時から、また新しい景色を選べます。読み返しはいつでもどうぞ。');
      else if(error.status===402 && ['failed','expired'].includes(error.body?.balance?.payment_state)){localStorage.removeItem('po_checkout_attempt_single');explain('お支払いは完了していません。お支払い方法を確認して、もう一度お選びください。');}
      else if(error.status===402 && new URLSearchParams(location.search).get('checkout')==='success' && get(PENDING,null))explain('おかえりなさい。お支払いの反映を確認しています。少し待ってから、手紙をお受け取りください。');
      else if(error.status===402) explain('続きの手紙は、一通ずつでも、日々の楽しみとしても。');
      else explain('手紙を受け取る準備ができませんでした。回数やお支払いは、再確認してからご案内します。もう一度お試しください。');
      return null;
    } finally {busy=false;}
  }
  function appendHistory(parent,entry) {
    const s=entry.snapshot;if(!s)return;
    const details=document.createElement('details');details.className='po-saved-letter';
    const summary=document.createElement('summary');summary.textContent=s.date+' · '+s.place.name;details.append(summary);
    for(const value of [s.title,s.intro,s.sceneLine,s.heart,s.action,s.place.fact,
      s.basis,s.sky?.skyTitle,s.sky?.skyFact,s.sky?.loreTitle,s.sky?.lore,s.sky?.story,s.sky?.discovery,s.sky?.reflection]){
      if(!value)continue;const p=document.createElement('p');p.textContent=value;details.append(p);
    }
    parent.append(details);
  }
  async function showHistory() {
    let history=document.querySelector('#poSavedLetters');
    if(!history){history=document.createElement('dialog');history.id='poSavedLetters';history.className='po-letter-access';document.body.append(history);}
    history.replaceChildren();
    const close=document.createElement('button');close.type='button';close.className='dialog-close';close.textContent='×';close.setAttribute('aria-label','閉じる');close.onclick=()=>history.close();history.append(close);
    const h=document.createElement('h2');h.textContent='これまでの手紙';history.append(h);
    const note=document.createElement('p');note.textContent='読み返しは無料です。無料体験の手紙はこのブラウザーに、有料の手紙はログインしたアカウントに残ります。';history.append(note);
    get(TRIAL,{readings:[]}).readings.slice().reverse().forEach(row=>appendHistory(history,row));
    if(!history.open)history.showModal();
    try {
      const me=await window.PlaceOracleAuth?.currentUser();
      if(me?.authenticated){
        const more=document.createElement('button');more.type='button';more.textContent='前の手紙を読む';
        let cursor;const load=async()=>{more.disabled=true;try{const data=await window.PlaceOracleAuth.readingHistory(cursor);more.remove();data.readings.forEach(row=>appendHistory(history,row));cursor=data.next_cursor;if(cursor)history.append(more);}catch{more.textContent='手紙を再取得する';history.append(more);}finally{more.disabled=false;}};
        more.onclick=load;await load();
      }
      else {const login=document.createElement('button');login.type='button';login.textContent='ログインして有料の手紙を読む';login.onclick=()=>{history.close();document.querySelector('#poMemberBtn')?.click();};history.append(login);}
    } catch {const error=document.createElement('p');error.textContent='アカウントの手紙を取得できませんでした。時間をおいて再度お試しください。';history.append(error);}
  }
  const historyButton=document.createElement('button');historyButton.type='button';historyButton.className='text-button';historyButton.textContent='これまでの手紙を読む';historyButton.onclick=showHistory;
  document.querySelector('.reading-actions')?.append(historyButton);
  window.addEventListener('placeoracle:history',showHistory);
  window.PlaceOracleAccess={authorize,showHistory};
  if(new URLSearchParams(location.search).get('checkout')==='success' && get(PENDING,null))
    explain('おかえりなさい。お支払いの反映を確認して、手紙をお届けします。反映に少し時間がかかることがあります。');
})();
