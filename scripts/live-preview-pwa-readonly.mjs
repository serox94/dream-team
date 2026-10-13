// Current PWA reads only. The prerequisite audit-fixes job proves writes on a new isolated Worker.
import assert from 'node:assert/strict';import {readFile,mkdir} from 'node:fs/promises';import {chromium} from 'playwright';import {authenticateReadOnly} from './preview-readonly-auth.mjs';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const shell=(await readFile('public/sw.js','utf8')).match(/const shell='([^']+)'/)[1],browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844},locale:'pl-PL'}),page=await context.newPage();await mkdir('live-preview-qa',{recursive:true});
const open=async path=>{await page.goto(base+path,{waitUntil:'commit',timeout:30000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});};
try{
 await authenticateReadOnly(context,base,'pl','Patryk');
 for(const path of ['/pages/checklisty.html','/pages/polowy.html','/pages/mapa.html','/pages/teren.html'])await open(path);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.waitForFunction(async shell=>!!(await(await caches.open(shell)).match('/__ryby_shell_complete')),shell,{timeout:60000});
 await context.setOffline(true);for(const path of ['/pages/checklisty.html','/pages/polowy.html','/pages/mapa.html','/pages/teren.html'])await open(path);assert.equal(await page.evaluate(()=>Dream.pendingCount()),0);await page.screenshot({path:'live-preview-qa/current-pwa-offline-390.png'});await context.setOffline(false);
 let reachedWorker=false;await context.route(base+'/knowledge.js?qa-quota',route=>{reachedWorker=!!route.request().serviceWorker();return route.fulfill({status:429,contentType:'text/html',body:'<html>Controlled quota failure</html>'});});
 try{const body=await page.evaluate(async()=>await(await fetch('/knowledge.js?qa-quota')).text());assert.ok(reachedWorker);assert.ok(body.includes('setupGeometry'),'actual complete SW copy on controlled 429');}finally{await context.unroute(base+'/knowledge.js?qa-quota');}
 await context.route(base+'/api/bootstrap',route=>route.fulfill({status:403,contentType:'text/html',body:'Forbidden'}));try{const result=await page.evaluate(async()=>{try{await Dream.api('/api/bootstrap');return 'UNEXPECTED_SUCCESS';}catch(e){return e.message;}});assert.match(result,/Nieprawidłowa odpowiedź serwera/);}finally{await context.unroute(base+'/api/bootstrap');}
 console.log('LIVE CURRENT PWA: PASS real offline navigation, complete SW quota fallback, API 403 denied, zero queue/business writes. Current offline write/replay proof is produced separately by this run’s isolated audit-fixes job.');
}catch(error){throw new Error('Current PWA: '+String(error.message).split('\n')[0]);}finally{await context.setOffline(false);await context.request.post(base+'/api/logout',{data:{},headers:{origin:base},timeout:10000}).catch(()=>{});await browser.close();}
