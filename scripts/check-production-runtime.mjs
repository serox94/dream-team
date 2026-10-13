// Public read only: preview QA must never log in or write to production.
const response=await fetch('https://dream-team.sewerynski00.workers.dev/login',{redirect:'manual',signal:AbortSignal.timeout(15000)});
if(response.status!==200)throw Error('Public production login page HTTP '+response.status);
console.log('PRODUCTION PUBLIC CHECK: PASS GET /login only; no credentials or private requests.');
