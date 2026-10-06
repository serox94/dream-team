import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const script=await readFile('public/i18n.js','utf8');
const locales={pl:JSON.parse(await readFile('public/locales/pl.json')),en:JSON.parse(await readFile('public/locales/en.json'))};
async function device(browserLanguage,preference){
 const dom=new JSDOM('<html lang="pl"><body><main class="login-card"><label>Hasło</label><button>Zaloguj</button><p data-user-content>Połowy</p></main></body></html>',{url:'https://dream.test/login',runScripts:'outside-only'});
 if(preference)dom.window.localStorage.setItem('dreamteam.language',preference);
 Object.defineProperty(dom.window.navigator,'language',{value:browserLanguage,configurable:true});
 dom.window.fetch=async url=>({json:async()=>locales[url.includes('/en.json')?'en':'pl']});
 await dom.window.eval(`(async()=>{${script}})()`);
 return dom;
}
test('device language defaults from browser, persists independently and leaves user content intact',async()=>{
 const patryk=await device('pl-PL'),english=await device('en-GB');
 assert.equal(patryk.window.document.documentElement.lang,'pl');assert.equal(patryk.window.document.querySelector('button').textContent,'Zaloguj');
 assert.equal(english.window.document.documentElement.lang,'en');assert.equal(english.window.document.querySelector('button').textContent,'Sign in');
 assert.equal(english.window.document.querySelector('[data-user-content]').textContent,'Połowy');
 assert.equal(patryk.window.localStorage.getItem('dreamteam.language'),null);
 english.window.localStorage.setItem('dreamteam.language','pl');
 const restarted=await device('en-GB',english.window.localStorage.getItem('dreamteam.language'));
 assert.equal(restarted.window.document.documentElement.lang,'pl');assert.equal(restarted.window.document.querySelector('button').textContent,'Zaloguj');
 patryk.window.close();english.window.close();restarted.window.close();
});
test('late editorial controls translate without changing user notes',async()=>{
 const d=await device('en-GB');
 const root=d.window.document.createElement('div');root.id='knowledge-root';root.innerHTML='<section><p>Typ dna</p><button>Wszystkie pozycje</button><p data-user-content>Typ dna</p></section>';
 d.window.document.body.append(root);await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(root.querySelector('p').textContent,'Bottom type');
 assert.equal(root.querySelector('button').textContent,'All items');
 assert.equal(root.querySelector('[data-user-content]').textContent,'Typ dna');d.window.close();
});
