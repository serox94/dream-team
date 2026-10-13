// Public health is independent of passwords and creates no sessions or failed attempts.
import assert from 'node:assert/strict';
const base=process.env.RYBY_PRODUCTION_URL||'https://dream-team-preview.sewerynski00.workers.dev';
const response=await fetch(base+'/login',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);assert.equal(response.headers.get('x-dreamteam-auth-mode'),'individual');if(process.env.GITHUB_SHA)assert.equal(response.headers.get('x-dreamteam-build'),process.env.GITHUB_SHA);assert.equal((await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)})).status,401);console.log('READONLY RELEASE HEALTH: PASS build, individual auth, protected API; zero sessions/login attempts.');
