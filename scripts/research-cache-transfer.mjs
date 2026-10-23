// Copy only already-approved research evidence. Never copies accounts, sessions,
// user content or translated business rows, and never updates lake GPS/source data.
import assert from 'node:assert/strict';
export const researchDatabase='1f421f38-e18e-497d-954a-957077a1a0f9';
const lake='b963484a-5ede-451a-acfa-1ab37eb9e219',tables=['research_pages','research_observations','research_jobs','research_locations'];
export async function transferResearchCache(readSource,executeTarget,{production=false,approved=false,maintenance=false}={}){
 assert.ok(!production||(approved&&maintenance),'PRODUCTION_CACHE_IMPORT_NOT_APPROVED');
 const target=await executeTarget('SELECT id,name,country,source_url FROM lakes WHERE id=?',[lake]);assert.equal(target.results.length,1,'EXACT_LAKE_REQUIRED');assert.equal(new URL(target.results[0].source_url).hostname,'www.fishingadventure.nl','SOURCE_HOST_CHANGED');
 const sourceLake=(await readSource('SELECT id,name,country FROM lakes WHERE id=?',[lake])).results[0];assert.equal(sourceLake?.name,target.results[0].name,'LAKE_NAME_CHANGED');assert.equal(sourceLake?.country,target.results[0].country,'LAKE_COUNTRY_CHANGED');
 const result={lakeId:lake,productionBusinessWrites:0,tables:{},settings:0};
 for(const table of tables){const rows=(await readSource('SELECT * FROM '+table+' WHERE lake_id=?',[lake])).results;
  for(const row of rows){if(table==='research_jobs')assert.equal(row.status,'complete','ONLY_COMPLETED_APPROVED_RESEARCH');if(table==='research_locations')assert.equal(row.status,'proposed','GPS_MUST_REMAIN_PROPOSAL');const keys=Object.keys(row);await executeTarget('INSERT OR IGNORE INTO '+table+' ('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));}
  result.tables[table]=rows.length;
 }
 for(const key of ['research.map.'+lake,'research.parser.'+lake]){const row=(await readSource('SELECT value FROM app_settings WHERE key=?',[key])).results[0];if(row){await executeTarget('INSERT OR IGNORE INTO app_settings(key,value) VALUES(?,?)',[key,row.value]);result.settings++;}}
 return result;
}
