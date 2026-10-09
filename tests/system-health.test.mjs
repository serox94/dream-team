import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';

test('authenticated system status reads backup metadata without exposing object names or secrets',async()=>{
 const DB=database(),env={DB,MEDIA:{},ASSETS:{fetch:async()=>new Response('<h1>Login</h1>')},RYBY_LOGIN_USERNAME:'test',RYBY_LOGIN_PASSWORD:'local-password',RYBY_SESSION_SECRET:'local-secret-32-characters-test-value',TAVILY_API_KEY:'fixture-secret',AI:{},AI_FREE_ONLY:'true',BACKUP_STATUS:{list:async()=>({objects:[{key:'dream-team-db/private.sql',size:3000,uploaded:new Date('2026-10-05T03:17:00Z')}]})}};
 try{
  const request=(path,options={})=>worker.fetch(new Request(`https://dream.test${path}`,options),env);
  assert.equal((await request('/api/settings')).status,401);
  const loginPage=await request('/login');assert.match(loginPage.headers.get('content-security-policy'),/connect-src 'self'/);
  const login=await request('/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=test&password=local-password'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await request('/api/settings',{headers:{cookie}}),raw=await response.text(),data=JSON.parse(raw);
  assert.equal(data.backupStatus,'available');assert.equal(data.lastBackupAt,'2026-10-05T03:17:00.000Z');assert.equal(data.schemaVersion,27);
  assert.equal(data.researchProviderConfigured,true);assert.equal(data.workersAiAvailable,true);assert.equal(data.mediaStorageAvailable,true);
  assert.doesNotMatch(raw,/private\.sql|fixture-secret|account_id/i);
 }finally{DB.close();}
});
