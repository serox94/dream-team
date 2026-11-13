import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {acquireD1Fence} from '../scripts/d1-write-fence.mjs';import {captureSnapshot} from '../scripts/d1-snapshot.mjs';
test('workerd: foreground and waitUntil writes admitted before fence cannot escape the snapshot',async()=>{
 const m=new Miniflare(convertV4MiniflareOptions({modules:true,script:readFileSync('scripts/isolated-release-probe-worker.mjs','utf8'),compatibilityDate:'2026-09-03',d1Databases:['DB']}));
 try{
  const db=await m.getD1Database('DB');await db.exec("CREATE TABLE audit_writes(id TEXT PRIMARY KEY,status TEXT); CREATE TABLE sequence_fixture(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO audit_writes VALUES('before','committed');");
  const foreground=m.dispatchFetch('http://localhost/audit/delay?id=fg').then(r=>r.json());const background=await m.dispatchFetch('http://localhost/audit/delay?id=bg');assert.equal(background.status,202);
  let admitted=false;for(let i=0;i<40;i++){if((await db.prepare("SELECT count(*) n FROM audit_writes WHERE status='admitted'").first()).n===2){admitted=true;break}await new Promise(r=>setTimeout(r,25))}assert.equal(admitted,true);
  const execute=async(_,sql,params=[])=>db.prepare(sql).bind(...params).all();execute.batch=async(_,sql)=>db.batch(sql.map(s=>db.prepare(s)));
  const database={uuid:'fixture',name:'dream-team-audit-123-db'},fence=await acquireD1Fence(database,execute);
  await db.exec('CREATE VIEW audit_gate_fg AS SELECT 1; CREATE VIEW audit_gate_bg AS SELECT 1;');assert.deepEqual(await foreground,{fenced:true,committed:false});
  let bg;for(let i=0;i<40;i++){const r=await m.dispatchFetch('http://localhost/audit/result?id=bg');if(r.ok){bg=await r.json();break}await r.body?.cancel();await new Promise(r=>setTimeout(r,25))}assert.deepEqual(bg,{fenced:true,committed:false});
  await fence.verify();const snapshot=await captureSnapshot(database,execute);assert.deepEqual(snapshot.tables.find(t=>t.name==='audit_writes').rows.map(r=>[r.id,r.status]).sort(),[['before','committed'],['bg','admitted'],['fg','admitted']]);await fence.release();
 }finally{await m.dispose()}
});
