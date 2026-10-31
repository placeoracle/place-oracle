import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
try {
  for (const [membership,hasBilling,visible] of [
    ['active',true,true],['past_due',true,true],['canceled',true,true],['none',false,false],['test',false,false]
  ]) {
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.route('https://place-oracle-billing.place-oracle-info.workers.dev/auth/me',route=>route.fulfill({
      status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify({authenticated:true,membership,test_access:membership==='test',has_billing_account:hasBilling,current_period_end:Math.floor(Date.now()/1000)+86400})
    }));
    // Avoid dependence on Google sign-in UI when checking membership rendering.
    await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',
      body:'window.google={accounts:{id:{initialize(){},renderButton(){}}}};'}));
    await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('#poMemberBtn').waitFor();
    await page.locator('#poMemberBtn').click();
    await page.waitForFunction(()=>document.querySelector('#poMemberStatus')?.textContent.includes('ログイン済み') || document.querySelector('#poMemberStatus')?.textContent.includes('有効です'));
    assert.equal(await page.locator('#poPortalBtn').isVisible(),visible,membership+' portal visibility');
    assert.equal(await page.locator('#poMemberBtn').textContent(),membership==='test'?'テスト利用':membership==='active'?'会員':'ログイン');
    await context.close();
  }
  console.log(JSON.stringify({result:'membership-management-pass',states:5}));
} finally { await browser.close(); }
