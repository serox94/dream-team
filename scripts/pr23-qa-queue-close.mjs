// Stop only this task's previous disposable QA queue before further preview testing.
import {query} from './recovery-common.mjs';
const db='190b6a54-919c-4628-98b0-27ab3902bdbd',lake='qa-pr23-cached-40521095443';
const name=(await query(db,'SELECT name FROM lakes WHERE id=?',[lake])).results[0]?.name;
if(name&&name!=='QA PR23 retained official cache')throw Error('QA_LAKE_OWNERSHIP_MISMATCH');
const before=(await query(db,'SELECT status,credits_reserved,credits_actual,message FROM research_jobs WHERE lake_id=?',[lake])).results;
if(name)await query(db,"UPDATE research_jobs SET status='blocked',lease_until=NULL,message='QA_CACHE_ONLY_STOPPED_NO_RETRY' WHERE lake_id=? AND status IN ('pending','processing')",[lake]);
console.log('PR23_OLD_QA_QUEUE '+JSON.stringify({lake,jobs:before,providerCredits:before.reduce((n,j)=>n+Number(j.credits_actual||0),0),productionWrites:0}));
