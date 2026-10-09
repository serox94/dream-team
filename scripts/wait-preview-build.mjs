// Wait until the public preview URL serves the exact commit deployed by this workflow.
import assert from 'node:assert/strict';
const base='https://dream-team-preview.sewerynski00.workers.dev',expected=process.env.GITHUB_SHA;
assert.ok(expected,'GITHUB_SHA is required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let last={};
for(let attempt=1;attempt<=24;attempt++){
  try{
    const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded','cache-control':'no-cache'},body:new URLSearchParams({username:process.env.RYBY_LOGIN_USERNAME,password:process.env.RYBY_LOGIN_PASSWORD})});
    if(login.status===303){
      const cookie=login.headers.get('set-cookie')?.split(';')[0];
      const response=await fetch(base+'/api/settings?build='+encodeURIComponent(expected),{headers:{cookie,'cache-control':'no-cache'}});
      if(response.ok){
        last=await response.json();
        if(last.environment==='preview'&&last.build===expected){console.log('PREVIEW BUILD READY:',expected);process.exit(0);}
      }else last={status:response.status};
    }else last={loginStatus:login.status};
  }catch(error){last={error:error.message};}
  console.log('Waiting for preview build',attempt,{seen:last.build||null,status:last.status||last.loginStatus||null});
  await sleep(2500);
}
throw new Error(`Preview did not serve expected build ${expected}; last state: ${JSON.stringify(last)}`);
