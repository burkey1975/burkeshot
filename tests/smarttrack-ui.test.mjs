import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('camera is the single default page and all navigation routes agree',()=>{
  const activePages=[...html.matchAll(/<main id="page-([^"]+)" class="page active">/g)].map(m=>m[1]);
  assert.deepEqual(activePages,['camera']);
  const top=[...html.matchAll(/<button(?: class="active")? data-page="([^"]+)"/g)].slice(0,4).map(m=>m[1]);
  const mobile=[...html.matchAll(/<button(?: class="active")? data-page="([^"]+)"/g)].slice(4).map(m=>m[1]);
  assert.deepEqual(new Set(top),new Set(['simulator','camera','session','coach']));
  assert.deepEqual(new Set(mobile),new Set(top));
});

test('HTML identifiers remain unique and SmartTrack-style controls exist',()=>{
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['smartShotBar','smartShotNo','smartClub','smartCarry','smartBall','smartLaunch','historyList','clubAverages','scatterCanvas'])assert.ok(ids.includes(id),id);
  for(const view of ['list','clubs','graph'])assert.ok(html.includes(`data-session-view="${view}"`));
});

test('overlay values are connected to results and trace is strong red',()=>{
  for(const field of ['smartShotNo','smartClub','smartCarry','smartBall','smartLaunch'])assert.ok(app.includes(`els.${field}`),field);
  assert.ok(app.includes("c.strokeStyle='#ff3b30'"));
  assert.ok(css.includes('.mobile-nav{position:fixed'));
  assert.ok(css.includes('.smart-shot-bar'));
});

test('reference branding and screenshots are not shipped as product UI',()=>{
  assert.ok(!html.includes('SmartTrack'));
  assert.ok(!html.includes('Knowhere'));
});
