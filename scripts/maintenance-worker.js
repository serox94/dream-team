// All hostnames and cron use this worker during an explicit maintenance window.
export default{fetch(){return new Response('Maintenance in progress. Try again later.',{status:503,headers:{'cache-control':'no-store','retry-after':'60'}});},scheduled(){}};
