import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
test('pasted screenshot satisfies native required-file validation and uploads the chosen file',async()=>{
 const dom=new JSDOM('<section id="deeper-media"></section>',{url:'https://dream.test/pages/sonar.html',runScripts:'outside-only'}),w=dom.window,uploads=[];
 w.fetch=async(path,options={})=>{if(options.method==='POST')uploads.push(options.body.get('image'));return {ok:true,json:async()=>path.endsWith('bootstrap')?{trips:[],lakes:[]}:path.endsWith('settings')?{workersAiAvailable:false}:{images:[]}};};
 await w.eval('(async()=>{'+await readFile('public/deeper-media.js','utf8')+'})()');await new Promise(r=>setTimeout(r,0));
 const file=new w.File([new Uint8Array(64)],'own-screen.png',{type:'image/png'}),paste=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{items:[{type:file.type,getAsFile:()=>file}]}});
 w.document.querySelector('#deeper-media').dispatchEvent(paste);const form=w.document.querySelector('form');assert.equal(form.checkValidity(),true,'clipboard selection must not be blocked by empty native file input');
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(uploads.length,1);assert.equal(uploads[0].size,64);assert.equal(w.document.querySelector('#media-file').required,true,'reset restores upload requirement');w.close();
});
