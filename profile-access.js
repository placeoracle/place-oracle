(() => {
 'use strict';
 const KEY='po_diagnosis_registration_v1';
 let state=null, activeToken=null, pending=null, syncing=null;
 const bridge=()=>window.PlaceOracleProfileBridge;
 const token=()=>window.PlaceOracleAuth?.token||null;
 const fields=p=>({birth:p.birth,birthPlace:{...p.birthPlace}});
 const same=(a,b)=>!!a&&!!b&&a.birth===b.birth&&a.birthPlace?.code===b.birthPlace?.code;
 const local=()=>{try{return JSON.parse(localStorage.getItem(KEY))||null;}catch{return null;}};
 const blocked='登録後の訂正は1回までです。2回目以降は、別のGoogleアカウントで新規登録してください。同じGoogleアカウントで入り直しても訂正回数は戻りません。';
 const transfer='会員契約・購入分・過去の手紙は新しいアカウントへ引き継げません。契約中の場合、元のアカウントで次回更新を停止してください。';
 async function readState(){
  const t=token();
  if(activeToken!==t){state=null;activeToken=t;}
  const next=t?(await window.PlaceOracleAuth.diagnosisProfile()).profile:local();
  if(token()!==t)throw new Error('ログイン状態が変わりました。もう一度確認してください。');
  state=next;
  return state;
 }
 function display(candidate,old,locked=false){
  if(pending)return pending;
  let finish;
  pending=new Promise(resolve=>{finish=resolve;});
  let dialog=document.querySelector('#poProfileConfirm');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='poProfileConfirm';dialog.className='po-letter-access';dialog.setAttribute('aria-labelledby','poProfileConfirmTitle');document.body.append(dialog);}
  dialog.replaceChildren();
  const h=document.createElement('h2');h.id='poProfileConfirmTitle';h.textContent=locked?'入力訂正の上限に達しています':old?'入力内容の訂正を確認':'生年月日・出生地を確認';
  dialog.append(h);
  const add=text=>{const p=document.createElement('p');p.textContent=text;dialog.append(p);};
  if(candidate){
   const dl=document.createElement('dl');dl.className='po-profile-summary';
   for(const [label,value] of [['生年月日',candidate.birth],['生まれた場所',candidate.birthPlace.prefecture+' '+candidate.birthPlace.municipality]]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);
   }dialog.append(dl);
  }
  add(locked?blocked:old?'これは登録後に1回だけできる訂正です。確定後、さらに入力を訂正する場合は別のGoogleアカウントが必要です。':'保存後の訂正は1回までです。入力に間違いがないか確認してください。');
  if(old||locked)add(transfer);
  if(!locked)add(token()?'生年月日・出生地と訂正回数を、このGoogleアカウントに保存します。過去の手紙と地図は書き換えません。':'ログイン前の登録内容と訂正回数は、このブラウザーに保存します。過去の手紙と地図は書き換えません。');
  const end=value=>{dialog.close();pending=null;finish(value);};
  const actions=document.createElement('div');actions.className='po-profile-actions';
  const back=document.createElement('button');back.type='button';back.className='text-button';back.textContent=locked?'閉じる':'入力に戻る';back.onclick=()=>{end(false);if(!locked)bridge()?.edit(candidate,!old);};actions.append(back);
  if(!locked){const accept=document.createElement('button');accept.type='button';accept.className='primary';accept.id='poProfileConfirmAccept';accept.textContent=old?'1回限りの訂正を確定する':'この内容で登録する';accept.onclick=()=>end(true);actions.append(accept);}
  dialog.append(actions);
  dialog.oncancel=event=>{event.preventDefault();end(false);};
  dialog.showModal();
  return pending;
 }
 async function ensure(candidate){
  try{
   const session=token();
   const old=await readState();
   if(same(old,candidate)){bridge()?.apply(old);return true;}
   if(old?.corrections_used>=1){await display(old,old,true);return false;}
   if(!await display(candidate,old))return false;
   if(token()!==session)throw new Error('ログイン状態が変わりました。もう一度確認してください。');
   if(token()){
    const result=await window.PlaceOracleAuth.saveDiagnosisProfile({...fields(candidate),confirmed:true,expected_version:old?.version||0});
    if(token()!==session)throw new Error('ログイン状態が変わりました。もう一度確認してください。');
    state=result.profile;
   }else{
    const latest=local();
    if(!same(latest,old)&&!!latest!==!!old || latest&&old&&latest.version!==old.version)throw new Error('別の画面で登録内容が更新されています。もう一度確認してください。');
    state={...fields(candidate),corrections_used:old?1:0,version:(old?.version||0)+1};
    localStorage.setItem(KEY,JSON.stringify(state));
   }
   bridge()?.apply(state);return true;
  }catch(error){
   const message=error.body?.code==='profile_locked'?blocked:error.message||'登録内容を確認できませんでした。時間をおいてお試しください。';
   const target=document.querySelector('#formError');if(target)target.textContent=message;
   state=null;return false;
  }
 }
 async function edit(){
  try{
   const old=await readState();
   if(old?.corrections_used>=1){await display(old,old,true);return;}
   if(old)bridge()?.apply(old);
   bridge()?.edit(undefined,!old);
  }catch{const target=document.querySelector('#poMemberResult');if(target)target.textContent='登録内容を確認できませんでした。もう一度ログインしてお試しください。';}
 }
 async function sync(){
  if(!token()||activeToken===token()||syncing)return;
  syncing=readState().then(p=>{if(p)bridge()?.apply(p);}).catch(()=>{state=null;activeToken=null;}).finally(()=>{syncing=null;});
  await syncing;
 }
 window.PlaceOracleProfile={
  ensure,edit,
  ensureCurrent:async()=>{const p=bridge()?.get();return p?ensure(p):false;},
  invalidate:()=>{state=null;activeToken=null;},
  get version(){return state?.version??null;}
 };
 window.addEventListener('placeoracle:auth',event=>{
  if(event.detail?.authenticated)void sync();else {state=null;activeToken=null;}
 });
})();
