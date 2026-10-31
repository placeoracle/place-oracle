import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE po_users(google_sub TEXT PRIMARY KEY,email TEXT,created_at INTEGER);
CREATE TABLE po_sessions(token_hash TEXT PRIMARY KEY,google_sub TEXT,expires_at INTEGER);
CREATE TABLE subscriptions(stripe_subscription_id TEXT PRIMARY KEY,stripe_customer_id TEXT NOT NULL,
 customer_email TEXT,status TEXT,stripe_price_id TEXT,current_period_end INTEGER,updated_at INTEGER,stripe_event_created INTEGER);
CREATE TABLE stripe_webhook_events(event_id TEXT PRIMARY KEY,event_type TEXT,event_created INTEGER,processed_at INTEGER);`);
db.exec(await readFile('billing-worker/reading-schema.sql','utf8'));
const DB={prepare(sql){const statement={sql,args:[],bind(...args){return {...this,args};},
 async first(){return db.prepare(this.sql).get(...this.args)||null;},
 async all(){return {results:db.prepare(this.sql).all(...this.args)};},
 async run(){return {meta:{changes:db.prepare(this.sql).run(...this.args).changes}};}};return statement;},
 async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
const source=await readFile('billing-worker/worker.mjs','utf8');
const {grantReading,readingBalance,safeReading,fulfillSingle,revokePayment,jstDay,worker}=Function('fetch',source.replace('export default','const worker =')+
 '\nreturn {grantReading,readingBalance,safeReading,fulfillSingle,revokePayment,jstDay,worker};')(()=>{throw Error('Unexpected Stripe access in isolated tests');});
const env={DB,STRIPE_PRICE_MONTHLY:'price_m',STRIPE_PRICE_YEARLY:'price_y'};
const user={google_sub:'qa_user',email:'qa@example.invalid'},other={google_sub:'qa_other',email:'other@example.invalid'};
for(const u of [user,other])db.prepare('INSERT INTO po_users VALUES (?,?,?)').run(u.google_sub,u.email,Date.now());
const snap=safeReading({date:'2026-10-30',title:'手紙',intro:'朝',sceneLine:'海',heart:'静けさ',action:'歩く',
 place:{id:'place_1',name:'場所',country:'日本'},scene:{name:'海'},theme:{name:'いま'},cycle:{day:{label:'甲子'}},birth:'2000-06-15',birthPlace:{name:'must-not-store'}});
assert.equal(snap.birth,undefined);assert.equal(snap.birthPlace,undefined);
assert.equal((await grantReading(env,user,'unpaid-request-01',snap)).reason,'payment_required');
const session={id:'cs_fixture',mode:'payment',payment_status:'unpaid',amount_total:100,currency:'jpy',client_reference_id:user.google_sub,payment_intent:'pi_fixture'};
db.prepare('INSERT INTO po_checkout_orders(order_id,google_sub,plan,session_id,created_at) VALUES (?,?,?,?,?)').run('order1',user.google_sub,'single',session.id,Date.now());
await fulfillSingle(env,session);assert.equal((await readingBalance(env,user)).credits,0);
await fulfillSingle(env,{...session,payment_status:'paid'});
await fulfillSingle(env,{...session,payment_status:'paid'});
assert.equal((await readingBalance(env,user)).credits,1,'duplicate paid events cannot duplicate credits');
const paid=await grantReading(env,user,'paid-request-001',snap);assert.equal(paid.ok,true);
assert.equal((await grantReading(env,user,'paid-request-001',{...snap,title:'tampered'})).snapshot.title,'手紙');
assert.equal((await grantReading(env,other,'paid-request-001',snap)).reason,'payment_required','no cross-account access');
assert.equal((await grantReading(env,user,'paid-request-002',snap)).reason,'payment_required','one credit grants only one result');
const now=Math.floor(Date.now()/1000);
db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?,?,?)').run('sub1','cus1',user.email,'active','price_m',now+86400,Date.now(),now);
const grants=await Promise.all(Array.from({length:8},(_,i)=>grantReading(env,user,'daily-request-'+String(i).padStart(3,'0'),snap)));
assert.equal(grants.filter(r=>r.ok).length,5,'parallel requests respect the five-per-day limit');
assert.equal((await readingBalance(env,user)).daily_remaining,0);
assert.equal((await grantReading(env,user,'daily-request-000',snap)).ok,true,'replay does not consume a sixth use');
db.prepare("UPDATE subscriptions SET status='canceled'").run();
assert.equal((await grantReading(env,user,'daily-request-000',snap)).ok,true,'past results remain readable after cancellation');
assert.equal((await grantReading(env,user,'new-after-cancel',snap)).reason,'payment_required');
assert.equal(jstDay(Date.parse('2026-10-30T14:59:59Z')),'2026-10-30');
assert.equal(jstDay(Date.parse('2026-10-30T15:00:00Z')),'2026-10-31');
await revokePayment(env,{type:'charge.refunded',data:{object:{object:'charge',payment_intent:'pi_late'}}});
const late={...session,id:'cs_late',payment_intent:'pi_late',payment_status:'paid'};
db.prepare('INSERT INTO po_checkout_orders(order_id,google_sub,plan,session_id,created_at) VALUES (?,?,?,?,?)').run('order2',user.google_sub,'single',late.id,Date.now());
await fulfillSingle(env,late);assert.equal((await readingBalance(env,user)).credits,0,'late success cannot revive a refunded payment');
await assert.rejects(fulfillSingle(env,{...late,amount_total:99}));
const token='reading_fixture_'.padEnd(43,'a');
const hashed=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');
db.prepare('INSERT INTO po_sessions VALUES (?,?,?)').run(hashed,user.google_sub,Date.now()+60000);
db.prepare('INSERT INTO po_diagnosis_profiles VALUES (?,?,?,0,1,?)').run(user.google_sub,'1990-01-01',JSON.stringify({prefecture:'東京都',municipality:'新宿区',code:'131041'}),Date.now());
async function route(url,method='GET',body,auth=true) {
 if(url==='/readings'&&method==='POST'&&body)body={...body,profile_version:1};
 return worker.fetch(new Request('https://worker.invalid'+url,{method,headers:{Origin:'https://placeoracle.github.io','Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
}
assert.equal((await route('/readings','GET',null,false)).status,401);
assert.equal((await route('/readings','POST',{request_id:'route-unpaid-001',snapshot:snap})).status,402);
assert.equal((await route('/readings','POST',{request_id:'bad',snapshot:{birth:'private'}})).status,400);
const historicalCount=db.prepare('SELECT count(*) AS n FROM po_reading_history WHERE google_sub=?').get(user.google_sub).n;
for(let i=0;i<31;i++)db.prepare("INSERT INTO po_reading_history VALUES (?,?,?,'member',NULL,?,?)").run(user.google_sub,'history-'+String(i).padStart(3,'0'),'2026-10-01',JSON.stringify(snap),1);
const page=await (await route('/readings')).json();assert.equal(page.readings.length,30);assert.ok(page.next_cursor);
const next=await (await route('/readings?before='+encodeURIComponent(page.next_cursor))).json();
assert.equal(page.readings.length+next.readings.length,historicalCount+31);
assert.equal(new Set([...page.readings,...next.readings].map(r=>r.request_id)).size,historicalCount+31);

// Operator access is keyed by the server's verified Google subject, never an email or browser flag.
const operator={google_sub:'operator_fixture',email:'operator@example.invalid'};
db.prepare('INSERT INTO po_users VALUES (?,?,?)').run(operator.google_sub,operator.email,Date.now());
const operatorEnv={...env,TEST_ACCOUNT_GOOGLE_SUB:operator.google_sub};
assert.equal((await readingBalance(env,operator)).member,false,'unset setting grants no access');
assert.equal((await readingBalance(operatorEnv,operator)).test_access,true);
assert.equal((await readingBalance(operatorEnv,{...other,email:operator.email})).member,false,'same email cannot impersonate the subject');
const testGrants=await Promise.all(Array.from({length:8},(_,i)=>grantReading(operatorEnv,operator,'operator-reading-'+i,snap)));
assert.equal(testGrants.filter(r=>r.ok).length,5,'test account retains the atomic daily cap');
assert.equal((await grantReading(operatorEnv,operator,'operator-reading-0',snap)).ok,true,'test rereads are free');
assert.equal((await readingBalance(operatorEnv,operator)).daily_remaining,0);
const operatorToken='operator_fixture_'.padEnd(43,'b');
const operatorHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(operatorToken))).toString('base64url');
db.prepare('INSERT INTO po_sessions VALUES (?,?,?)').run(operatorHash,operator.google_sub,Date.now()+60000);
async function operatorRoute(path,method='GET',body,authenticated=true) {
 return worker.fetch(new Request('https://worker.invalid'+path,{method,headers:{Origin:'https://placeoracle.github.io','Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+operatorToken}:{})},...(body?{body:JSON.stringify(body)}:{})}),operatorEnv);
}
const operatorMe=await (await operatorRoute('/auth/me')).json();
assert.equal(operatorMe.membership,'test');assert.equal(operatorMe.test_access,true);
assert.equal(operatorMe.has_billing_account,false,'free access creates no Stripe subscription');
assert.equal((await operatorRoute('/auth/me','GET',null,false)).status,401);
const checkout=await operatorRoute('/checkout/create','POST',{plan:'monthly',request_id:'operator-checkout-attempt-01'});
assert.equal(checkout.status,409);assert.equal((await checkout.json()).code,'test_account','test operator cannot accidentally create a paid Checkout');
assert.equal((await grantReading(env,operator,'operator-after-revoke',snap)).reason,'payment_required','removing the server setting revokes new free use');
assert.equal((await grantReading(env,operator,'operator-reading-0',snap)).ok,true,'revocation preserves previously delivered history');

console.log(JSON.stringify({result:'reading-access-pass',checks:['one-time 100 JPY','paid webhook only','idempotent fulfillment','one credit one reading','account isolation','canonical replay','five parallel daily grants','midnight JST','cancellation keeps history','out-of-order refund','no raw profile in reading snapshots','operator subject isolation','operator daily cap','operator checkout blocked','operator access revocation']}));
db.close();
