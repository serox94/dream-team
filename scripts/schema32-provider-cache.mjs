// Existing isolated QA evidence only; never calls a provider or touches production.
import {writeFile} from 'node:fs/promises';
import {cf,query} from './recovery-common.mjs';
const db='190b6a54-919c-4628-98b0-27ab3902bdbd',lake='73cba183-fbfa-45cc-9d71-cf6a7abf038c';
const data=await query(db,'SELECT url,content,checked_at,scope FROM research_pages WHERE lake_id=?',[lake]);
if(data.results.length>5||data.meta.rows_read>100)throw Error('CACHE_DIAGNOSTIC_BUDGET');
const jobs=await query(db,'SELECT status,message,queue_json,credits_reserved,credits_actual,discovery_done FROM research_jobs WHERE lake_id=?',[lake]);
await writeFile('rc-status/cached-provider-sources.json',JSON.stringify(data.results,null,2));
console.log('CACHED_PROVIDER_DIAGNOSTIC '+JSON.stringify({pages:data.results.map(p=>({url:p.url,characters:p.content.length})),jobs:jobs.results,schedules:await cf('/workers/scripts/dream-team-research-preview/schedules'),rowsRead:data.meta.rows_read+jobs.meta.rows_read,providerCalls:0,productionWrites:0}));
