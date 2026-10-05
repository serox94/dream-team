// Browser QA uses only the disposable local D1 fixture, never production data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './qa-server.mjs';
import {weatherFixture} from './qa-weather.mjs';

const widths=[360,390,412,768,1280];
const routes=['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/mapa.html','/pages/teren.html','/pages/pogoda.html','/pages/dojazd.html','/pages/regulamin.html','/pages/wezly.html','/pages/rigi.html','/pages/porady.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html'];
const preview=await serve({seed:true,weatherFetch:async()=>Response.json(weatherFixture())});
const loginPreview=await serve({testSession:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const screenshotDir='qa-screenshots';
await mkdir(screenshotDir,{recursive:true});
try{
  for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:width<=412,hasTouch:width<=412});
    for(const route of routes){
      const page=await context.newPage(),errors=[];
      let requests=0;
      page.on('request',()=>requests++);
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
      const response=await page.goto(preview.url+route,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,`${width} ${route}: HTTP`);
      await page.locator('html[data-ready="true"]').waitFor({timeout:15000});
      if(route.includes('encyklopedia')||route.includes('sonar.html'))await page.locator('.knowledge-entry').first().waitFor({timeout:15000});
      if(route==='/'){
        const readyMs=await page.evaluate(()=>Math.round(performance.now()));
        await page.waitForFunction(()=>document.getElementById('dashboard-weather-now')?.textContent.includes('15°C'));
        await page.waitForFunction(()=>typeof window.renderDreamChart==='function');
        assert.match(await page.locator('.hero-side-card img').getAttribute('src'),/patryk-maciek\.jpeg$/);
        assert.equal(await page.locator('.score-chart').count(),2);
        assert.equal(await page.locator('.score-row').count(),4);
        assert.match(await page.locator('#trip-score-total').innerText(),/2 ryb.*23,0 kg/);
        assert.equal(await page.locator('body').getAttribute('data-field-mode'),'before');
        assert.match(await page.locator('#field-readiness').innerText(),/Gotowość do wyjazdu/);
        console.log(`Dashboard ${width}px disposable fixture: ready ${readyMs} ms, ${requests} requests after chart load.`);
      }
      const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      if(dimensions.scroll>dimensions.viewport+1||dimensions.body>dimensions.viewport+1){
        const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+2||el.scrollWidth>el.clientWidth+2).slice(0,16).map(el=>({tag:el.tagName,id:el.id,className:String(el.className).slice(0,70),right:Math.round(el.getBoundingClientRect().right),scroll:el.scrollWidth,client:el.clientWidth})));
        assert.fail(`${width} ${route}: horizontal overflow ${JSON.stringify(dimensions)} ${JSON.stringify(offenders)}`);
      }
      assert.deepEqual(errors,[],`${width} ${route}: console/network`);
      if(route==='/pages/teren.html'){
        assert.match(await page.locator('main').innerText(),/Najważniejsze nad wodą/);
        assert.ok(await page.locator('main a[href^="https://www.google.com/maps/search/"]').count());
      }
      if(route==='/pages/encyklopedia.html'){
        assert.equal(await page.locator('.knowledge-entry').count(),14);
        assert.ok(await page.locator('a[href="/pages/rigi.html"]').count());
        assert.ok(await page.locator('a[href="/pages/wezly.html"]').count());
      }
      if(route==='/pages/sonar.html'){
        assert.equal(await page.locator('.knowledge-entry').count(),17);
        assert.equal(await page.locator('#sonar-gallery a[href^="https://support.deeper.eu/"]').count(),4);
        assert.match(await page.locator('.knowledge-hero').innerText(),/CHIRP\+ 2 \/ Fish Deeper/);
      }
      if(width===390&&['/pages/encyklopedia.html','/pages/sonar.html'].includes(route)){
        const label=route.includes('encyklopedia')?'encyklopedia':'sonar';
        await page.screenshot({path:`${screenshotDir}/${label}-top-390.png`});
      }
      if(route==='/pages/ustawienia.html'){
        await page.locator('#category-list input[aria-label="Nazwa kategorii"]').first().waitFor();
        const names=await page.locator('#category-list input[aria-label="Nazwa kategorii"]').evaluateAll(nodes=>nodes.map(n=>n.value));
        for(const name of ['sprzęt','zakupy','jedzenie / picie'])assert.ok(names.includes(name),`default category ${name}`);
      }
      if(width<=412){
        const links=page.locator('.bottom-nav a, .bottom-nav button');
        for(const link of await links.all()){
          const box=await link.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44,`${width} ${route}: small bottom navigation target`);
        }
        if(route==='/'){
          if(width===390){
            const navTop=(await page.locator('.bottom-nav').boundingBox()).y;
            for(const selector of ['#dashboard-trip-name','#dashboard-lake','#dashboard-peg','#dashboard-dates','#dashboard-weather-now','#dashboard-check-inline','.hero-actions a:first-child']){
              const box=await page.locator(selector).boundingBox();
              assert.ok(box&&box.y+box.height<navTop,`390px dashboard first fold: ${selector} is below navigation`);
            }
            const photo=await page.locator('.hero-side-card img').boundingBox(),facts=await page.locator('.trip-facts').boundingBox();
            assert.ok(photo.y>=facts.y+facts.height,'mobile portrait follows the essential trip facts');
          }
          await page.locator('#bottom-more').click();
          const menu=page.locator('#main-nav.open'),menuBox=await menu.boundingBox();
          assert.ok(menuBox&&menuBox.y>=0&&menuBox.y+menuBox.height<=844-60,`${width}: menu is not within the usable viewport`);
          await page.locator('#bottom-more').click();
          assert.equal(await page.locator('#bottom-more').getAttribute('aria-expanded'),'false');
          await page.mouse.move(1,1);
        }
        if(width===390&&route==='/pages/checklisty.html'){
          const search=page.locator('#check-search');
          await search.fill('podbierak');
          assert.equal(await page.locator('.check-item-row').count(),1,'checklist search narrows the rows');
          const checkbox=page.locator('.check-item-row input[type="checkbox"]');
          assert.equal(await checkbox.isChecked(),true);
          await page.locator('.check-item-left .check-item-title').click();
          await page.waitForFunction(()=>document.querySelector('.check-item-row input[type="checkbox"]')?.checked===false);
          await search.fill('');
        }
        if(width===390&&route==='/pages/polowy.html'){
          assert.equal(await page.locator('#weight').getAttribute('inputmode'),'decimal');
          assert.match(await page.locator('#caught_at').inputValue(),/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
          const options=await page.locator('#person option').allTextContents();
          assert.ok(options.includes('Patryk')&&options.includes('Maciek'));
        }
        if(width===390&&route==='/pages/encyklopedia.html'){
          const search=page.locator('#knowledge-search');await search.fill('termoklina');
          assert.ok(await page.locator('.knowledge-entry').count()>=1);
          await search.fill('');
          await page.locator('[data-category="Przynęty"]').click();
          assert.ok((await page.locator('.knowledge-entry').count())>=3);
          await page.locator('[data-category="Wszystkie"]').click();
          await page.locator('#knowledge-tag').selectOption('PVA');
          assert.ok((await page.locator('.knowledge-entry').count())>=1);
          await page.locator('#knowledge-tag').selectOption('');
          await page.locator('#diagnostic-step [data-answer="no"]').click();
          assert.match(await page.locator('#diagnostic-step').innerText(),/krok 2/i);
          for(let i=1;i<8;i++)await page.locator('#diagnostic-step [data-answer="yes"]').click();
          assert.match(await page.locator('#diagnostic-step').innerText(),/Plan na teraz/);
          await page.locator('#tactic-form').evaluate(form=>form.requestSubmit());
          assert.match(await page.locator('#tactic-result').innerText(),/Dobry punkt startowy/);
          assert.ok(await page.locator('.article-sources').count()>=1);
        }
        if(width===390&&route==='/pages/sonar.html'){
          await page.locator('#spot-form').evaluate(form=>form.requestSubmit());
          assert.match(await page.locator('#spot-result').innerText(),/Trzy punkty/);
          await page.locator('#quiz-stage [data-quiz="0"]').click();
          assert.match(await page.locator('#quiz-feedback').innerText(),/potwierdzenia ciężarkiem/);
          const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kVsAAAAASUVORK5CYII=','base64');
          await page.locator('#shot-file').setInputFiles({name:'deeper.png',mimeType:'image/png',buffer:tiny});
          assert.equal(await page.locator('#shot-controls').isVisible(),true);
          await page.locator('#shot-q1').selectOption('yes');
          await page.locator('#shot-analyze').click();
          assert.match(await page.locator('#shot-result').innerText(),/Twoich odpowiedzi/);
          assert.equal(preview.requests.filter(r=>r.method==='POST'&&r.url.includes('knowledge')).length,0,'screenshot never uploaded');
        }
      }
      if(route==='/'||width===390&&['/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html'].includes(route)||width===1280&&['/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html'].includes(route)){
        const label=route==='/'?'dashboard':route.split('/').pop().replace('.html','');
        await page.screenshot({path:`${screenshotDir}/${label}-${width}.png`,fullPage:route!=='/'&&!['encyklopedia','sonar'].includes(label)});
      }
      await page.close();
    }
    const login=await context.newPage(),loginResponse=await login.goto(loginPreview.url+'/login');
    assert.equal(loginResponse.status(),200);
    const loginDimensions=await login.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(loginDimensions.scroll<=loginDimensions.viewport+1,`${width} login: horizontal overflow`);
    const manifestResponse=await login.request.get(loginPreview.url+'/manifest.webmanifest');
    assert.equal(manifestResponse.status(),200,'manifest is public for login and installation');
    const manifest=await manifestResponse.json();
    assert.equal(manifest.name,'DreamTeam');assert.equal(manifest.display,'standalone');
    const submit=await login.locator('button[type="submit"]').boundingBox();assert.ok(submit&&submit.height>=44,`${width} login: small submit`);
    await login.screenshot({path:`${screenshotDir}/login-${width}.png`});
    if(width===390){
      const offline=await context.newPage();
      await offline.goto(preview.url+'/pages/checklisty.html');
      await offline.locator('html[data-ready="true"]').waitFor();
      await offline.waitForFunction(async()=>Boolean(await caches.match('/index.html')),{timeout:20000});
      const before=preview.DB.sqlite.prepare('SELECT COUNT(*) n FROM checklist_items').get().n;
      await context.setOffline(true);
      await offline.goto(preview.url+'/',{waitUntil:'domcontentloaded'});
      await offline.locator('html[data-ready="true"]').waitFor({timeout:20000});
      assert.match(await offline.locator('#offline-banner').innerText(),/Dane offline \/ ostatnia synchronizacja/);
      assert.equal(await offline.locator('.score-row').count(),4);
      const denied=await offline.evaluate(()=>window.Dream.api('/api/checklist',{method:'POST',body:'{}'}).then(()=>false,()=>true));
      assert.ok(denied,'offline writes fail instead of queuing');
      assert.equal(preview.DB.sqlite.prepare('SELECT COUNT(*) n FROM checklist_items').get().n,before);
      await context.setOffline(false);
      await offline.reload();
      await offline.locator('html[data-ready="true"]').waitFor();
      assert.equal(await offline.locator('#offline-banner').count(),0,'online reads replace stale banner');
      await context.setOffline(true);
      for(const knowledgeRoute of ['/pages/encyklopedia.html','/pages/sonar.html']){
        await offline.goto(preview.url+knowledgeRoute,{waitUntil:'domcontentloaded'});
        await offline.locator('.knowledge-entry').first().waitFor({timeout:20000});
        assert.ok(await offline.locator('.knowledge-entry').count()>=14,`${knowledgeRoute}: offline editorial data`);
        if(knowledgeRoute.includes('encyklopedia')){
          await offline.locator('#tactic-form').evaluate(form=>form.requestSubmit());
          assert.match(await offline.locator('#tactic-result').innerText(),/Dobry punkt startowy/,'offline tactic result');
        }else{
          await offline.locator('#spot-form').evaluate(form=>form.requestSubmit());
          assert.match(await offline.locator('#spot-result').innerText(),/Trzy punkty/,'offline spot advice');
          await offline.locator('#quiz-stage [data-quiz="0"]').click();
          assert.match(await offline.locator('#quiz-feedback').innerText(),/potwierdzenia ciężarkiem/,'offline quiz feedback');
          const offlineShot=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kVsAAAAASUVORK5CYII=','base64');
          await offline.locator('#shot-file').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:offlineShot});
          await offline.locator('#shot-q1').selectOption('yes');
          await offline.locator('#shot-analyze').click();
          assert.match(await offline.locator('#shot-result').innerText(),/Twoich odpowiedzi/,'offline screenshot guidance');
        }
      }
      await context.setOffline(false);
      await offline.close();
      console.log('390px offline: static shell, encyclopedia, sonar, private read cache, visible timestamp and write refusal PASS.');
    }
    await context.close();
    console.log(`Responsive QA ${width}px: PASS (${routes.length} screens + login, no overflow or browser errors).`);
  }
  preview.DB.sqlite.prepare("UPDATE trips SET start_at=?,end_at=? WHERE id='next-trip'").run(new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+86400000).toISOString());
  const field=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await field.goto(preview.url+'/');await field.locator('html[data-ready="true"]').waitFor();
  assert.equal(await field.locator('body').getAttribute('data-field-mode'),'field');
  assert.ok(await field.locator('.hero-actions a[href="/pages/teren.html"]').count());
  assert.match(await field.locator('#field-readiness').innerText(),/Checklista na łowisku/);
  await field.screenshot({path:`${screenshotDir}/dashboard-field-390.png`});
  await field.close();
  console.log('390px active trip field mode PASS.');
}finally{await browser.close();await preview.close();await loginPreview.close();}
