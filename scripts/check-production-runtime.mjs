// Authenticated read only. Never prints credentials, cookies or secret values.
const base='https://dream-team.sewerynski00.workers.dev';
const username=process.env.RYBY_LOGIN_USERNAME,password=process.env.RYBY_LOGIN_PASSWORD;
if(!username||!password)throw Error('Existing DreamTeam login credentials unavailable to runtime check.');
const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];
if(login.status!==303||!cookie)throw Error('Production authenticated runtime check: login failed.');
const response=await fetch(base+'/api/settings',{headers:{cookie},cache:'no-store'});
if(!response.ok)throw Error(`Production authenticated runtime check: settings HTTP ${response.status}.`);
const data=await response.json();
console.log(JSON.stringify({researchProviderConfigured:Boolean(data.researchProviderConfigured),workersAiAvailable:Boolean(data.workersAiAvailable),mediaStorageAvailable:Boolean(data.mediaStorageAvailable),schemaVersion:data.schemaVersion}));
