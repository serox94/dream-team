// Only the existing isolated research environment. Real Tavily, no AI, no production writes.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {chromium} from 'playwright';import {query} from './recovery-common.mjs';import {rowsDigest} from './d1-snapshot.mjs';import {waitForOfflineReady} from './qa-offline-ready.mjs';
const deployment=JSON.parse(await readFile('research-status/deploy.json','utf8')),base=deployment.previewUrl,db=deployment.database.id,lake='b963484a-5ede-451a-acfa-1ab37eb9e219',trip='07b77117-e1e0-419d-8082-1d9147469ded',source='https://www.fishingadventure.nl/en/informatie/reglement-fishing-adventure-lake/';
assert.equal(db,'1f421f38-e18e-497d-954a-957077a1a0f9');assert.equal(base,'https://dream-team-research-preview.sewerynski00.workers.dev');
const q=async(s,v=[])=>(await query(db,s,v)).results,counts=async()=>Object.fromEntries(await Promise.all(['lakes','trips','catches','checklist_items','auth_accounts','content_translations','content_sources','translation_jobs','translation_cache'].map(async t=>{const rows=await q('SELECT * FROM '+t);return [t,{n:rows.length,digest:rowsDigest(rows)}];})));
const report={result:'BLOCKED',build:process.env.GITHUB_SHA,preview:base,productionWrites:0,aiCalls:0,tests:[],failures:[]},test=(name,pass,detail)=>{report.tests.push({name,result:pass?'PASS':'FAIL',detail});if(!pass)report.failures.push(name);};await mkdir('research-status/screenshots',{recursive:true});let browser,cookie;const before=await counts();
async function api(path,method='GET',data){const r=await fetch(base+path,{method,headers:{cookie,origin:base,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(90000)});return {status:r.status,data:await r.json()};}
try{
 const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD})});assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
 report.usageBefore=(await api('/api/research-provider-status')).data;
 assert.equal(report.usageBefore.freeOnlyConfirmed,true,'No paid or unverified provider calls');
 let research;
 for(let i=0;i<4;i++){const r=await api('/api/lakes/'+lake+'/research','POST',{url:source});assert.equal(r.status,200,JSON.stringify(r.data));research=r.data.research;if(research.job.status!=='pending')break;}
 report.analysis={job:research.job,pages:research.pages,fields:[...new Set(research.facts.map(f=>f.field))],observations:research.facts.length,missing:research.missing,conflicts:research.conflicts,gps:research.locations};
 test('real official regulations and related pages',research.pages.length>=2&&research.facts.length>=10);
 for(const [field,predicate] of Object.entries({rods:f=>f.normalized===3,bait_boats:f=>f.base==='PERMITTED',distance:f=>f.normalized===150,leadcore:f=>f.base==='PROHIBITED',mat:f=>f.provided&&f.base==='PROHIBITED',net:f=>f.provided&&f.base==='PROHIBITED',sling:f=>f.provided&&f.base==='PROHIBITED',disinfectant:f=>f.base==='REQUIRED',lifejacket:f=>f.base==='REQUIRED',bait:f=>/particles/i.test(f.evidence)&&/prohibit|forbid/i.test(f.evidence),toilets:f=>true,showers:f=>true,depth:f=>f.normalized===20}))test('Adventure official evidence: '+field,research.facts.some(f=>f.field===field&&predicate(f)));
 report.peg18=research.facts.filter(f=>f.field==='electricity'&&/\b18\b/.test(f.evidence)).map(f=>({url:f.url,evidence:f.evidence}));
 test('electricity explicitly includes swim 18',report.peg18.length>0);
 const afterFirst=(await api('/api/research-provider-status')).data;const repeated=await api('/api/lakes/'+lake+'/research','POST',{url:source});const afterRepeat=(await api('/api/research-provider-status')).data;test('cached research resumes without another provider request',repeated.status===200&&afterFirst.key.usage===afterRepeat.key.usage);report.usageAfter=afterRepeat;
 const suggestions=(await api('/api/trips/'+trip+'/suggestions')).data;test('provided nets mats and slings are not suggested as own equipment',suggestions.items.every(i=>!/(mata|podbierak|sling)/i.test(i.label)));
 // Retain the user reference as a proposal; never pretend it was found on the official page.
 await api('/api/lakes/'+lake+'/gps-propose','POST',{latitude:52.18123,longitude:6.79140,kind:'lake'});
 const lakeBefore=(await q('SELECT * FROM lakes WHERE id=?',[lake]))[0];const current=(await api('/api/lakes/'+lake+'/profile')).data.lake;test('research does not overwrite existing GPS',current.latitude===52.184572&&current.longitude===6.795781);
 report.reusedEvidence={run:39833023313,build:'bcefae61ca87aa4f1624d3e1ecc64bf78f14a94e',unchangedTests:['weather existing GPS','GPS explicit approval guard','GPS approval compare-and-swap','approved GPS reaches real Weather PRO']};
 browser=await chromium.launch();
 for(const lang of ['pl','en'])for(const theme of ['light','dark'])for(const width of [390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},locale:lang==='en'?'en-GB':'pl-PL'});await ctx.addInitScript(({lang,theme,trip})=>{localStorage.setItem('dreamteam.language',lang);localStorage.setItem('dreamteam.theme',theme);localStorage.setItem('dream_team_viewed_trip',trip);},{lang,theme,trip});
  const username=lang==='en'?'Maciek':'Patryk',l=await ctx.request.post(base+'/api/login',{form:{username,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});assert.equal(l.status(),303);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/pages/wyjazdy.html',{waitUntil:'domcontentloaded'});await page.locator('html[data-ready=true]').waitFor({timeout:45000}).catch(async e=>{await page.screenshot({path:'research-status/screenshots/ui-failure.png',fullPage:true});report.uiFailure={url:page.url(),errors,body:(await page.locator('body').innerText()).slice(-1500)};throw e;});await page.locator(`[data-view-lake="${lake}"]`).click();await page.locator('.research-evidence').waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);test(`archive research ${lang}/${theme}/${width}: UI, horizontal overflow, JS`,!overflow&&errors.length===0,{errors,overflow});
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.equal(await page.locator('html').getAttribute('lang'),lang);
  await page.locator('.research-evidence').scrollIntoViewIfNeeded();await page.screenshot({path:`research-status/screenshots/research-${lang}-${theme}-${width}.png`,fullPage:true});
  if(lang==='en'&&theme==='light'&&width===390){await waitForOfflineReady(page);await ctx.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('html[data-ready=true]').waitFor({timeout:45000});test('PWA archive shell and theme offline',await page.locator('html').getAttribute('data-theme')==='light');await ctx.setOffline(false);}
  await ctx.request.post(base+'/api/logout',{headers:{origin:base}});await ctx.close();
 }
 test('isolated D1 foreign keys',!(await q('PRAGMA foreign_key_check')).length);
 const after=await counts();for(const t of Object.keys(before)){const same=before[t].n===after[t].n&&before[t].digest===after[t].digest;test('preserved '+t,same,{before:before[t].n,after:after[t].n});}report.integrity={before,after};
 report.result=report.failures.length?'PARTIAL':'PASS';
}catch(e){report.error=String(e.message).slice(0,600);report.result='FAIL';process.exitCode=1;}
finally{if(browser)await browser.close();if(cookie)await fetch(base+'/api/logout',{method:'POST',headers:{cookie,origin:base}}).catch(()=>{});await writeFile('research-status/live-qa.json',JSON.stringify(report,null,2));console.log('RESEARCH_LIVE_QA '+JSON.stringify(report));}
