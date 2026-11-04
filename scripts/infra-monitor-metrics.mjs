// Read-only aggregation of Cloudflare runtime metrics; no user data is returned.
export function workerMetrics(groups){
 if(!Array.isArray(groups))throw Error('WORKER_METRICS_UNAVAILABLE');
 return groups.reduce((sum,row)=>{
  const requests=row?.sum?.requests,errors=row?.sum?.errors;
  if(!Number.isSafeInteger(requests)||requests<0||!Number.isSafeInteger(errors)||errors<0||errors>requests)throw Error('WORKER_METRICS_INVALID');
  return {requests:sum.requests+requests,errors:sum.errors+errors};
 },{requests:0,errors:0});
}
export const workerErrorAlert=({requests,errors})=>errors>=5&&errors/Math.max(1,requests)>=0.05;
