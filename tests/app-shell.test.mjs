import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const shell=readFileSync(new URL('../public/app-shell.js',import.meta.url),'utf8');

test('shared navigation excludes nested Fisheries and Essentials but preserves routes and countdown',()=>{
 const dom=new JSDOM('<html lang="pl"><body></body></html>',{url:'https://fixture.test',runScripts:'outside-only'});
 const w=dom.window;
 try{
  w.eval(shell);
  assert.equal(w.DreamShell.entries.length,14);
  assert.equal(new Set(w.DreamShell.entries.map(x=>x[0])).size,14);
  assert.ok(!w.DreamShell.entries.some(([key])=>['lowiska','teren'].includes(key)));
  assert.ok(w.DreamShell.entries.some(([key])=>key==='wyjazdy'));
  const now=Date.parse('2026-10-26T12:00:00Z');
  for(const lang of ['pl','en']){
   w.document.documentElement.lang=lang;
   assert.match(w.DreamShell.countdown({},now),lang==='pl'?/ustalenia/:/confirmed/);
   assert.match(w.DreamShell.countdown({start:'2026-10-27T12:00:00Z'},now),lang==='pl'?/Do wyjazdu: 1 dni/:/Trip in 1d/);
   assert.match(w.DreamShell.countdown({start:'2026-10-25T12:00:00Z',end:'2026-10-27T12:00:00Z'},now),lang==='pl'?/trwa/:/in progress/);
   assert.match(w.DreamShell.countdown({start:'2026-10-24T12:00:00Z',end:'2026-10-25T12:00:00Z'},now),lang==='pl'?/zakończony/:/ended/);
  }
 }finally{w.close();}
});

test('Essentials card promotes exactly 20 days before departure through end; remains available lower otherwise',()=>{
 const dom=new JSDOM('<html lang="pl"><body data-page="dashboard"><main class="page-content"><section class="hero-card"></section><section id="stats"></section></main></body></html>',{url:'https://fixture.test/',runScripts:'outside-only'});
 const w=dom.window;
 try{
  w.eval(shell);
  const start='2026-11-20T12:00:00.000Z',end='2026-11-27T12:00:00.000Z';
  const before20=Date.parse('2026-10-31T11:59:59Z'),at20=Date.parse('2026-10-31T12:00:00Z');
  const trip={start,end,status:'planning',isActive:true};
  w.DREAM_TRIP=trip;
  assert.equal(w.DreamShell.essentialsPriority(trip,before20),false);
  assert.equal(w.DreamShell.essentialsPriority(trip,at20),true);
  assert.equal(w.DreamShell.essentialsPriority(trip,Date.parse('2026-11-22T12:00:00Z')),true);
  assert.equal(w.DreamShell.essentialsPriority(trip,Date.parse('2026-11-27T12:00:01Z')),false);
  assert.equal(w.DreamShell.essentialsPriority({...trip,status:'archived'},at20),false);
  assert.equal(w.DreamShell.essentialsPriority({start},Date.parse('2026-11-21T12:00:00Z')),false,'unknown end is not treated as indefinitely ongoing');
  w.DreamShell.mountEssentials(before20);
  assert.equal(w.document.querySelector('main').lastElementChild.id,'trip-essentials-card');
  assert.ok(w.document.querySelector('#trip-essentials-card a[href="/pages/teren.html"]'));
  w.DreamShell.mountEssentials(at20);
  assert.equal(w.document.querySelector('.hero-card').nextElementSibling.id,'trip-essentials-card');
  assert.equal(w.document.querySelectorAll('#trip-essentials-card').length,1);
  w.DreamShell.mountEssentials(Date.parse('2026-11-28T12:00:00Z'));
  assert.equal(w.document.querySelector('main').lastElementChild.id,'trip-essentials-card');
  w.document.body.dataset.page='wyjazdy';
  w.DreamShell.mountEssentials(at20);
  assert.equal(w.document.querySelector('.hero-card').nextElementSibling.id,'trip-essentials-card');
 }finally{w.close();}
});


test('Essentials threshold uses fishery calendar time across DST and rejects invalid ranges',()=>{
 const dom=new JSDOM('<html><body></body></html>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(shell);
  // Paris falls back on25October:20calendar days before7November12:00 is18October12:00 CEST.
  const trip={start:'2026-11-07T11:00:00Z',end:'2026-11-14T11:00:00Z',lakeProfile:{facts:{timeZone:'Europe/Paris'}}};
  for(const [at,wanted] of [['2026-10-17T10:00:00Z',false],['2026-10-18T09:59:59Z',false],['2026-10-18T10:00:00Z',true],['2026-10-19T10:00:00Z',true],['2026-11-14T11:00:00Z',true],['2026-11-14T11:00:01Z',false]])assert.equal(w.DreamShell.essentialsPriority(trip,Date.parse(at)),wanted,at);
  for(const invalid of [{},{start:'invalid'},{...trip,end:'2026-01-01'},{...trip,status:'archived'}])assert.equal(w.DreamShell.essentialsPriority(invalid,Date.parse('2026-10-19T10:00:00Z')),false);
 }finally{w.close();}
});
