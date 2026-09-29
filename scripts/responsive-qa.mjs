// Browser QA uses only the disposable local D1 fixture, never production data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './qa-server.mjs';
import {weatherFixture} from './qa-weather.mjs';

const widths=[360,390,412,768,1280];
const routes=['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/mapa.html','/pages/pogoda.html','/pages/dojazd.html','/pages/regulamin.html','/pages/wezly.html','/pages/rigi.html','/pages/porady.html'];
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
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
      const response=await page.goto(preview.url+route,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,`${width} ${route}: HTTP`);
      await page.locator('html[data-ready="true"]').waitFor({timeout:15000});
      if(route==='/')await page.waitForFunction(()=>document.getElementById('dashboard-weather-now')?.textContent.includes('15°C'));
      const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(dimensions.scroll<=dimensions.viewport+1&&dimensions.body<=dimensions.viewport+1,`${width} ${route}: horizontal overflow ${JSON.stringify(dimensions)}`);
      assert.deepEqual(errors,[],`${width} ${route}: console/network`);
      if(width<=412){
        const links=page.locator('.bottom-nav a, .bottom-nav button');
        for(const link of await links.all()){
          const box=await link.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44,`${width} ${route}: small bottom navigation target`);
        }
        if(route==='/'){
          await page.locator('#bottom-more').click();
          const menu=page.locator('#main-nav.open'),menuBox=await menu.boundingBox();
          assert.ok(menuBox&&menuBox.y>=0&&menuBox.y+menuBox.height<=844-60,`${width}: menu is not within the usable viewport`);
          await page.locator('#bottom-more').click();
          assert.equal(await page.locator('#bottom-more').getAttribute('aria-expanded'),'false');
          await page.mouse.move(1,1);
        }
      }
      if(route==='/'||width===390&&['/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html'].includes(route)){
        const label=route==='/'?'dashboard':route.split('/').pop().replace('.html','');
        await page.screenshot({path:`${screenshotDir}/${label}-${width}.png`,fullPage:route!=='/'});
      }
      await page.close();
    }
    const login=await context.newPage(),loginResponse=await login.goto(loginPreview.url+'/login');
    assert.equal(loginResponse.status(),200);
    const loginDimensions=await login.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(loginDimensions.scroll<=loginDimensions.viewport+1,`${width} login: horizontal overflow`);
    const submit=await login.locator('button[type="submit"]').boundingBox();assert.ok(submit&&submit.height>=44,`${width} login: small submit`);
    await login.screenshot({path:`${screenshotDir}/login-${width}.png`});
    await context.close();
    console.log(`Responsive QA ${width}px: PASS (${routes.length} screens + login, no overflow or browser errors).`);
  }
}finally{await browser.close();await preview.close();await loginPreview.close();}
