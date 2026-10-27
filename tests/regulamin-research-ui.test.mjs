import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const renderer=readFileSync(new URL('../public/trip-renderer-v2.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../public/dream-loader-v2.js',import.meta.url),'utf8');
const manager=readFileSync(new URL('../public/trip-manager.js',import.meta.url),'utf8');
const lake='https://www.fishingadventure.nl/en/informatie/reglement-fishing-adventure-lake/';

function scenario(language='pl',url='/pages/regulamin.html'){
 const dom=new JSDOM('<!DOCTYPE html><html lang="'+language+'"><body><main class="container page-content"></main></body></html>',{url:'https://dream.test'+url,runScripts:'outside-only'});
 dom.window.DreamLanguage={get:()=>language};
 dom.window.Dream={safeUrl:u=>typeof u==='string'&&u.startsWith('https://')?u:null};
 dom.window.eval(renderer);
 const trip={id:'historical-adventure-2025',lake:'Old Trip Lake',lakeId:'old-lake',year:2025,stats:{},facts:{rulesText:'Legacy content'},lakeProfile:{id:'old-lake',name:'Old Trip Lake',facts:{}}};
 const fact=(field,pl,en,evidence,rule,base=rule,extra={})=>({field,labelPl:pl,labelEn:en,evidence,rule,base,scope:'lake',url:lake,checkedAt:'2026-10-22',effectiveYear:null,conditional:rule==='CONDITIONAL',...extra});
 const profile={lake:{id:'adventure',name:'Fishing Adventure Lake',facts:{}},research:{pages:[{url:lake}],facts:[
   fact('leadcore','Leadcore','Leadcore','Leadcore is prohibited.','PROHIBITED'),
   fact('distance','Dystans łowienia','Fishing distance','Do not fish further than 150 meters.','CONDITIONAL','PERMITTED',{normalized:150}),
   fact('mat','Mata','Unhooking mat','Own mat is forbidden; the fishery provides one.','PROHIBITED','PROHIBITED',{provided:true}),
   fact('parking','Parking','Parking','Parking is available.','UNKNOWN')
 ]}};
 return {dom,trip,profile};
}

test('lake research is explicitly requested for the rules page, not only legacy trip documents',()=>{
 assert.match(loader,/const rulesPage=/);
 assert.match(loader,/\/api\/lakes\/\$\{encodeURIComponent\(id\)\}\/manager/);
 assert.match(loader,/lakeResearch,lakeResearchError,selectedLake/);
 assert.match(manager,/\/pages\/regulamin\.html\?lakeId=/);
});

for(const language of ['pl','en'])test('rules page shows saved Adventure research with source links, typed prohibitions and historical caveats: '+language,async()=>{
 const {dom,trip,profile}=scenario(language);
 try{
  await dom.window.DreamTripRenderer.render({trip,documents:[],lakeResearch:profile,selectedLake:{id:'adventure',name:'Fishing Adventure Lake',facts:{}}});
  const html=dom.window.document.querySelector('main').innerHTML;
  assert.match(html,/Fishing Adventure Lake/);
  assert.match(html,/Leadcore is prohibited/);
  assert.match(html,/150 m/);
  assert.match(html,/Own mat is forbidden/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.equal(dom.window.document.querySelectorAll('[data-lake-research-rules]').length,1);
  assert.equal(dom.window.document.querySelectorAll('.research-fact').length,3,'facility information is not confused with regulations');
  assert.match(html,/2026-10-22/);
  assert.match(html,language==='pl'?/nie automatycznie zatwierdzony regulamin/:/not a confirmed regulation/);
  assert.ok(!html.includes('Legacy content'),'unrelated archived trip must not contaminate selected lake');
  assert.ok(!html.includes('Old Trip Lake'));
  assert.ok(!html.includes('Brak szczegółowych zasad'), 'saved evidence should replace empty legacy placeholders');
 }finally{dom.window.close();}
});

test('legacy trip rules remain available alongside research for the same lake',async()=>{
 const {dom,trip,profile}=scenario();
 try{
  trip.lake='Fishing Adventure Lake';trip.lakeId='adventure';trip.lakeProfile={id:'adventure',name:'Fishing Adventure Lake',facts:{}};
  await dom.window.DreamTripRenderer.render({trip,documents:[{kind:'rules',title:'Wędki',content:'Legacy rule from the trip document.'}],lakeResearch:profile});
  const html=dom.window.document.querySelector('main').innerHTML;
  assert.match(html,/Legacy rule from the trip document/);
  assert.match(html,/Leadcore is prohibited/);
 }finally{dom.window.close();}
});

test('rules page shows explicit missing-data and source-load errors rather than a blank section',async()=>{
 const {dom,trip}=scenario();
 try{
  await dom.window.DreamTripRenderer.render({trip,documents:[],lakeResearch:{research:{pages:[],facts:[]}}});
  assert.match(dom.window.document.querySelector('main').textContent,/Brak zapisanych zasad/);
  await dom.window.DreamTripRenderer.render({trip,documents:[],lakeResearchError:'NETWORK_UNAVAILABLE'});
  assert.match(dom.window.document.querySelector('main').textContent,/NETWORK_UNAVAILABLE/);
 }finally{dom.window.close();}
});


const originalPlaineRegulations=readFileSync(new URL('../public/data/lakes/plaine2/regulamin.html',import.meta.url),'utf8');
const frenchResearch={
 lake:{id:'plaine2',name:'La Plaine des Bois 2'},
 research:{
  pages:[{url:'https://www.example.org/plaine2/rules'}],
  facts:[{field:'leadcore',labelPl:'Leadcore',labelEn:'Leadcore',evidence:'Leadcore is prohibited.',rule:'PROHIBITED',base:'PROHIBITED',scope:'lake',url:'https://www.example.org/plaine2/rules',checkedAt:'2026-10-26',effectiveYear:null}]
 }
};
test('original Plaine 2 regulations remain primary when research observations exist',async()=>{
 const {dom,trip}=scenario('pl');
 trip.lakeId='plaine2';trip.lake='La Plaine des Bois 2';
 trip.lakeProfile={id:'plaine2',name:'La Plaine des Bois 2',facts:{contentPack:'plaine2'}};
 dom.window.fetch=async()=>({ok:true,text:async()=>originalPlaineRegulations});
 try{
  await dom.window.DreamTripRenderer.render({trip,documents:[],lakeResearch:frenchResearch});
  const main=dom.window.document.querySelector('main'),html=main.textContent;
  assert.match(html,/Przyjazd: między 12:00 a 14:00/);
  assert.match(html,/kaucja 200 EUR/);
  assert.match(html,/haki bezzadziorowe/);
  const supplement=main.querySelector('details[data-research-supplement]');
  assert.ok(supplement,'cited research supplements curated rules without replacing them');
  assert.equal(supplement.open,false,'new raw research stays collapsed by default');
  assert.match(supplement.textContent,/Leadcore is prohibited/);
  assert.ok(main.innerHTML.indexOf('Przyjazd:')<main.innerHTML.indexOf('Dodatkowy research'));
 }finally{dom.window.close();}
});

test('opening Plaine 2 via Fisheries always shows its own saved regulations, even from another trip',async()=>{
 const {dom,trip}=scenario('pl','/pages/regulamin.html?lakeId=plaine2');
 dom.window.fetch=async()=>({ok:true,text:async()=>originalPlaineRegulations});
 try{
  await dom.window.DreamTripRenderer.render({trip,documents:[{kind:'rules',title:'Another lake',content:'Other trip private regulations'}],selectedLake:{id:'plaine2',name:'La Plaine des Bois 2',facts:{contentPack:'plaine2'}},lakeResearch:frenchResearch});
  const text=dom.window.document.querySelector('main').textContent;
  assert.match(text,/Przyjazd: między 12:00 a 14:00/);
  assert.ok(!text.includes('Other trip private regulations'),'no cross-trip rules contamination');
 }finally{dom.window.close();}
});
