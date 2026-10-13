import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('spot edit waits for data without keeping Save disabled after the previous save settles',async()=>{
 const dom=new JSDOM(await readFile('public/pages/mapa.html','utf8'),{url:'https://dream.test/pages/mapa.html',runScripts:'outside-only'}),w=dom.window;
 let complete;const response=new Promise(resolve=>complete=resolve);
 w.d1Client={from:()=>({select:()=>({order:()=>response})})};w.scrollTo=()=>{};
 w.eval(await readFile('public/app.js','utf8'));
 const form=w.document.getElementById('spot-form'),save=w.document.getElementById('save-spot-btn'),depth=w.document.getElementById('spot-depth');
 form.dataset.saving='true';save.disabled=true;
 const editing=w.editSpot(7);assert.equal(depth.disabled,true);
 delete form.dataset.saving;save.disabled=false;
 complete({data:[{id:7,name:'Original spot',depth_m:2}],error:null});await editing;
 assert.equal(depth.value,'2');assert.equal(depth.disabled,false);assert.equal(save.disabled,false);
 assert.equal(w.document.getElementById('edit-spot-id').value,'7');w.close();
});
