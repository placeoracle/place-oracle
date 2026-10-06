import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('qa-artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 60000 });
const cards = page.locator('.story-card');
if (await cards.count() !== 10) throw new Error('Expected 10 visible story cards');
await cards.nth(0).click();
const selected = await page.locator('.story-card[aria-pressed="true"]').count();
if (selected !== 1) throw new Error('Exactly one card must show selected state');
const inlineTitle = (await page.locator('#inlineTitle').textContent() || '').trim();
const inlineText = (await page.locator('#inlineText').innerText() || '').trim();
const selectedTeaser = (await page.locator('.story-card[aria-pressed="true"] strong').textContent() || '').trim();
const selectedTone = await page.locator('.story-card[aria-pressed="true"]').getAttribute('data-tone');
if (!inlineTitle || !inlineText || !selectedTeaser) throw new Error('Selected story copy is incomplete');
if (/\bundefined\b/i.test([inlineTitle, inlineText, selectedTeaser].join(' '))) throw new Error('Undefined story copy is visible');
if (!['bright','quiet','wistful'].includes(selectedTone || '')) throw new Error('Selected story tone is missing or invalid');
await page.waitForFunction(() => {
  const image = document.querySelector('.story-card[aria-pressed="true"] img');
  return image?.complete && image.naturalWidth > 0;
}, { timeout: 30000 });
const state = await page.evaluate(() => {
  const rail = document.querySelector('.story-rail');
  const card = document.querySelector('.story-card[aria-pressed="true"]');
  const image = card.querySelector('img');
  const style = getComputedStyle(card);
  return {
    railScrollable: rail.scrollWidth > rail.clientWidth,
    selectedBoxShadow: style.boxShadow,
    cardWidth: Math.round(card.getBoundingClientRect().width),
    viewportWidth: window.innerWidth,
    selectedImageWidth: image.naturalWidth,
    selectedImageSource: image.currentSrc
  };
});
if (!state.railScrollable) throw new Error('Mobile story rail is not horizontally scrollable');
if (state.selectedBoxShadow === 'none') throw new Error('Selected story frame is not visible');
if (state.cardWidth < 260 || state.cardWidth > 300) throw new Error('Mobile story card width is unexpected: ' + state.cardWidth);
await page.screenshot({ path: 'qa-artifacts/story-gallery-mobile.png', fullPage: true });
const bodyText = await page.locator('body').innerText();
if (bodyText.trimEnd().endsWith('\\n')) throw new Error('Literal \\n is visible at the end of the page');
console.log(JSON.stringify({ ...state, inlineTitle, inlineTextLength: inlineText.length, selectedTone, result: 'pass' }));
await browser.close();