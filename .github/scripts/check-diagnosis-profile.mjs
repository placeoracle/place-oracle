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
const {worker,saveDiagnosisProfile,getDiagnosisProfile}=Function('fetch',source.replace('export default','const worker =')+'\nreturn {worker,saveDiagnosisProfile,getDiagnosisProfile};')(()=>{throw Error('No network allowed');});
const env={DB},user={google_sub:'profile_owner'},other={google_sub:'profile_other'};
for(const u of [user,other])db.prepare('INSERT INTO po_users VALUES (?,?,?)').run(u.google_sub,u.google_sub+'@example.invalid',Date.now());
const original={birth:'1990-01-01',birthPlace:{prefecture:'東京都',municipality:'新宿区',code:'131041'},confirmed:true,expected_version:0};
assert.equal((await saveDiagnosisProfile(env,user,{...original,confirmed:false})).status,400);
assert.equal((await saveDiagnosisProfile(env,user,{...original,birth:'1990-02-30'})).status,400);
assert.equal((await saveDiagnosisProfile(env,user,{...original,birthPlace:{...original.birthPlace,prefecture:'静岡県'}})).status,400);
const first=await saveDiagnosisProfile(env,user,original);assert.equal(first.status,200);assert.equal(first.profile.corrections_used,0);assert.equal(first.profile.version,1);
assert.equal((await saveDiagnosisProfile(env,user,original)).profile.corrections_used,0,'duplicate registration consumes no correction');
assert.equal(await getDiagnosisProfile(env,other),null,'account isolation');
const correction={...original,birth:'1991-02-03',expected_version:1};
const stale=await saveDiagnosisProfile(env,user,{...correction,expected_version:0});assert.equal(stale.code,'profile_stale');
const saved=await saveDiagnosisProfile(env,user,correction);assert.equal(saved.status,200);assert.equal(saved.profile.corrections_used,1);assert.equal(saved.profile.version,2);
assert.equal((await saveDiagnosisProfile(env,user,correction)).status,200,'network retries remain idempotent');
assert.equal((await saveDiagnosisProfile(env,user,{...original,expected_version:2})).code,'profile_locked','second correction cannot restore the first identity');
const parallel=await Promise.all([
 saveDiagnosisProfile(env,other,original),
 saveDiagnosisProfile(env,other,{...original,birth:'1992-02-03'})
]);assert.equal(parallel.filter(r=>r.status===200).length,1,'concurrent registrations do not spend a correction');
const race=await Promise.all([
 saveDiagnosisProfile(env,other,{...original,birth:'1993-03-04',expected_version:1}),
 saveDiagnosisProfile(env,other,{...original,birth:'1994-04-05',expected_version:1})
]);assert.equal(race.filter(r=>r.status===200).length,1,'only one concurrent correction wins');
const token='profile_test_'.padEnd(43,'x'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');
db.prepare('INSERT INTO po_sessions VALUES (?,?,?)').run(hash,user.google_sub,Date.now()+60000);
const request=(path,method='GET',body,auth=true,origin='https://placeoracle.github.io')=>worker.fetch(new Request('https://worker.invalid'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
assert.equal((await request('/profile','GET',null,false)).status,401);
assert.equal((await request('/profile','GET',null,true,'https://evil.invalid')).status,403);
const authenticated=await (await request('/profile')).json();assert.equal(authenticated.profile.birth,correction.birth);
assert.equal(authenticated.profile.corrections_used,1,'new session cannot reset the correction count');
assert.equal((await request('/profile','POST',{...original,google_sub:other.google_sub,expected_version:2})).status,409,'request body cannot target a different account');
assert.equal((await getDiagnosisProfile(env,other)).corrections_used,1);
console.log(JSON.stringify({result:'diagnosis-profile-pass',checks:['confirmed registration','invalid input','idempotent retry','one correction','concurrent updates','account isolation','logout persistence','origin/auth checks']}));
db.close();
