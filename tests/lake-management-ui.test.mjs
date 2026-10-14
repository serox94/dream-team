import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {database} from './db.mjs';

function fixture() {
  const DB=database(),env={DB,ASSETS:{fetch:async()=>new Response('ok')},RYBY_LOGIN_USERNAME:'local',RYBY_LOGIN_PASSWORD:'local-pass',RYBY_SESSION_SECRET:'test-secret-for-lake-deletion-32-characters'};
  const session=worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'local',password:'local-pass'})}),env).then(r=>r.headers.get('set-cookie').split(';')[0]);
  const call=async(path,method='GET',data)=>{
    const cookie=await session;
    const response=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{cookie,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env);
    return {status:response.status,data:await response.json()};
  };
  return {DB,env,call};
}

test('cannot delete a lake used by current or archived trips',async()=>{
  const {DB,call}=fixture();
  try {
    const before=DB.sqlite.prepare('SELECT COUNT(*) n FROM trips').get().n;
    assert.equal((await call('lakes/plaine2','DELETE',{})).status,409);
    assert.equal((await call('lakes/wygonin','DELETE',{})).status,409);
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM trips').get().n,before);
    assert.ok(DB.sqlite.prepare("SELECT id FROM lakes WHERE id='plaine2'").get());
  } finally {DB.close();}
});

test('can delete an unused lake and only its own research records',async()=>{
  const {DB,call}=fixture();
  try {
    const created=await call('lakes','POST',{name:'Testowa woda do usunięcia',country:'Polska'});
    assert.equal(created.status,201);
    const id=created.data.id;
    DB.sqlite.prepare("INSERT INTO lake_sources(id,lake_id,url,title,source_type) VALUES('source-remove',?,'https://example.test','Test','manual')").run(id);
    DB.sqlite.prepare("INSERT INTO lake_facts(id,lake_id,field,value,source_id) VALUES('fact-remove',?,'depth','2m','source-remove')").run(id);
    DB.sqlite.prepare("INSERT INTO lake_fact_changes(id,lake_id,field,old_value,new_value,source_id) VALUES('change-remove',?,'depth','1m','2m','source-remove')").run(id);
    DB.sqlite.prepare("INSERT INTO lake_research_runs(id,lake_id,status,provider) VALUES('run-remove',?,'completed','test')").run(id);
    assert.equal((await call('lakes/'+encodeURIComponent(id),'DELETE',{})).status,200);
    for(const [table,col] of [['lakes','id'],['lake_sources','lake_id'],['lake_facts','lake_id'],['lake_fact_changes','lake_id'],['lake_research_runs','lake_id']]){
      assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col}=?`).get(id).n,0,table);
    }
    assert.equal(DB.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM trips').get().n,4);
    assert.equal((await call('lakes/'+encodeURIComponent(id),'DELETE',{})).status,404);
  } finally {DB.close();}
});

test('dashboard exposes restored metric IDs and settings use collapsible panels',()=>{
  const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../public/settings.js',import.meta.url),'utf8');
  const lakeUi=readFileSync(new URL('../public/trip-manager.js',import.meta.url),'utf8');
  assert.match(page,/id="dashboard-last-fish"/);
  assert.match(page,/id="dashboard-avg-weight"/);
  assert.match(script,/foldSettingsPanel/);
  assert.match(script,/settings-panel-details/);
  assert.match(lakeUi,/id="lake-delete"/);
});
