import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const fail = message => { throw new Error(message); };
const index = await readFile('index.html', 'utf8');
const qa = await readFile('PHOTO_QA.html', 'utf8');

const poolMatch = index.match(/const storyPool=\[([\s\S]*?)\n  \];\n  const (?:activeStories|featuredStoryIds)=/);
if (!poolMatch) fail('storyPool was not found');
const stories = Function('"use strict"; return [' + poolMatch[1] + '];')();
if (stories.length !== 50) fail('Expected 50 STORY records, found ' + stories.length);

const expectedIds = Array.from({ length: 50 }, (_, i) => i + 1);
if (stories.map(x => x.id).join(',') !== expectedIds.join(',')) fail('STORY IDs must be 1–50 in order');

const requiredStoryFields = ['tone','scene','title','img','fallback','alt','focus','zoom','teaser','text','end','source','sourceUrl'];
for (const story of stories) {
  for (const key of requiredStoryFields) {
    const value = story[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      fail('Missing STORY ' + story.id + ' field: ' + key);
    }
  }
  if (!['bright','quiet','wistful'].includes(story.tone)) fail('Invalid STORY tone for ' + story.id + ': ' + story.tone);
  if (!/^\d+% \d+%$/.test(story.focus)) fail('Invalid STORY focus for ' + story.id + ': ' + story.focus);
  if (!/^\d+(?:\.\d+)?$/.test(String(story.zoom))) fail('Invalid STORY zoom for ' + story.id + ': ' + story.zoom);
  if (/\bundefined\b/i.test([story.teaser,story.text,story.end].join(' '))) fail('Undefined copy leaked into STORY ' + story.id);
}
if (index.includes('<script src="./membership-widget.js"></script>\\n</body></html>')) fail('Literal \\n is rendered after membership widget');
if (!index.includes('id="visibleSkyHeading">この場所から見える空</h3>')) fail('Visible-sky concept heading is missing');
if (!index.includes('<span class="sky-signs-label">この空のしるし</span>')) fail('Sky-sign concept label is missing');
if (!index.includes('<h4>空から生まれた物語</h4>')) fail('Story-from-sky concept heading is missing');


const cards = [...qa.matchAll(/<article class="card" data-id="(\d+)"([\s\S]*?)<\/article>/g)].map(match => {
  const [, id, body] = match;
  const image = body.match(/<img src="([^"]+)" alt="([^"]*)" loading="lazy" onerror="this\.onerror=null;this\.src='([^']+)'"/);
  return {
    id: Number(id),
    img: image?.[1],
    alt: image?.[2],
    fallback: image?.[3],
    scene: body.match(/<div class="scene">([^<]*)<\/div>/)?.[1],
    title: body.match(/<h2>([^<]*)<\/h2>/)?.[1],
    sourceUrl: body.match(/<a class="source" href="([^"]+)"/)?.[1]
  };
});
if (cards.length !== 50) fail('Expected 50 PHOTO_QA cards, found ' + cards.length);

const cardById = new Map(cards.map(card => [card.id, card]));
const photoId = value => value?.match(/(?:photos\/|pexels\.com\/photo\/)(\d+)/)?.[1] || value?.match(/-(\d+)\/?$/)?.[1];
const external = [];
const firstParty = [];
for (const story of stories) {
  const card = cardById.get(story.id);
  if (!card) fail('PHOTO_QA card missing for STORY ' + story.id);
  for (const key of ['img', 'fallback', 'alt', 'scene', 'title']) {
    if (story[key] !== card[key]) fail('Mismatch for STORY ' + story.id + ': ' + key);
  }
  if (!/^https?:/.test(story.img)) await access(story.img, fsConstants.R_OK);
  await access(story.fallback, fsConstants.R_OK);
  if (/^https:/.test(story.img)) {
    if (!story.sourceUrl || !card.sourceUrl) fail('Source URL missing for STORY ' + story.id);
    if (photoId(story.img) !== photoId(story.sourceUrl) || photoId(story.img) !== photoId(card.sourceUrl)) {
      fail('Pexels source mismatch for STORY ' + story.id);
    }
    external.push(story);
  } else {
    if (story.img !== story.fallback) fail('First-party primary image must equal fallback for STORY ' + story.id);
    if (story.source !== 'PLACE ORACLE' || story.sourceUrl !== '') fail('First-party source metadata invalid for STORY ' + story.id);
    firstParty.push(story);
  }
}
if (external.length + firstParty.length !== 50) fail('Expected 50 adopted images total');
if (external.length !== 50) fail('Expected 50 external Pexels images, found ' + external.length);
if (firstParty.length !== 0) fail('Expected 0 first-party primary images, found ' + firstParty.length);

const fallbackIds = new Map();
for (const story of stories) {
  const ids = fallbackIds.get(story.fallback) ?? [];
  ids.push(story.id);
  fallbackIds.set(story.fallback, ids);
}
for (const [fallback, ids] of fallbackIds) {
  if (ids.length !== 1) fail('Duplicate fallback image used by STORY ' + ids.join(', ') + ': ' + fallback);
}

const timeout = AbortSignal.timeout(20000);
const results = await Promise.all(external.map(async story => {
  const response = await fetch(story.img, { headers: { Range: 'bytes=0-0' }, signal: timeout });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.startsWith('image/')) {
    fail('External image unavailable for STORY ' + story.id + ' (' + response.status + ', ' + contentType + ')');
  }
  await response.body?.cancel();
  return story.id;
}));
console.log(JSON.stringify({ stories: stories.length, qaCards: cards.length, externalImages: results.length, firstPartyImages: firstParty.length, result: 'pass' }));