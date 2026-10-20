import assert from 'node:assert/strict';
export function assertWeatherProof(proof,candidate,now=Date.now()){
 assert.equal(proof.format,'dream-team-weather-gate-v1');assert.equal(proof.result,'PASS');assert.equal(proof.candidate,candidate);
 assert.equal(proof.regressionCases,16);assert.equal(proof.productionWrites,0);assert.equal(proof.replaySchema,29);
 assert.ok(now-Date.parse(proof.createdAt)>=0&&now-Date.parse(proof.createdAt)<12*3600000,'WEATHER_PROOF_STALE');
 assert.deepEqual(proof.observations.map(o=>[o.width,o.language]).sort(),[[390,'en'],[390,'pl'],[1280,'en'],[1280,'pl']].sort());
 for(const o of proof.observations){assert.equal(o.apiStatus,200);assert.equal(o.reportAvailable,true);for(const id of ['carp-pressure','carp-wind','carp-rain','carp-air','carp-window'])assert.ok(o.fields[id]?.trim()&&!['—','--'].includes(o.fields[id].trim()),'WEATHER_FIELD_EMPTY:'+id);}
 return true;
}
