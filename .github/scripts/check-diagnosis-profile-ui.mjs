import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){}}}};'}));
 await page.route('https://place-oracle-billing.place-oracle-info.workers.dev/auth/me',r=>r.fulfill({status:401,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"authenticated":false}'}));
 await page.goto('http://127.0.0.1:4173/index.html?growth_test=1',{waitUntil:'domcontentloaded'});
 const consent=page.getByRole('button',{name:'許可しない',exact:true});if(await consent.isVisible())await consent.click();
 await page.click('#heroStart');
 await page.selectOption('#birthYear','1990');await page.selectOption('#birthMonth','1');await page.selectOption('#birthDay','1');
 await page.selectOption('#birthPrefecture','東京都');await page.selectOption('#birthMunicipality','131041');
 const scene=()=>page.getByText('海と水平線',{exact:true}).click();
 await scene();await page.click('#read');await page.locator('#poProfileConfirm').waitFor({state:'visible'});
 await page.getByRole('button',{name:'入力に戻る',exact:true}).click();
 assert.equal(await page.locator('#birthYear').isVisible(),true,'back reveals the birth inputs');
 assert.equal(await page.locator('#birthPrefecture').inputValue(),'東京都','draft birthplace is retained');
 await page.selectOption('#birthYear','1991');await scene();await page.click('#read');
 await page.click('#poProfileConfirmAccept');await page.locator('#themeBlock').waitFor({state:'visible'});
 const edit=async()=>{await page.click('#poMemberBtn');await page.click('#poProfileEdit');};
 await edit();await page.selectOption('#birthYear','1992');await scene();await page.click('#read');
 assert.equal(await page.getByRole('button',{name:'1回限りの訂正を確定する',exact:true}).isVisible(),true);
 await page.click('#poProfileConfirmAccept');await page.locator('#themeBlock').waitFor({state:'visible'});
 await edit();await page.getByRole('heading',{name:'入力訂正の上限に達しています',exact:true}).waitFor();
 assert.equal(await page.locator('#poProfileConfirmAccept').count(),0,'no second correction action');
 await page.reload({waitUntil:'domcontentloaded'});await edit();
 await page.getByRole('heading',{name:'入力訂正の上限に達しています',exact:true}).waitFor();
 console.log(JSON.stringify({result:'diagnosis-profile-ui-pass',checks:['draft preserved on back','confirmed registration','one correction','locked after reload']}));
}finally{await browser.close();}
