// Used only by the isolated QA wrapper; never installed on production.
export function meteredD1(binding,{requestLimit=4000}={}){
 let reads=0,writes=0,queries=0,unknown=false;const raw=new WeakMap();
 const check=()=>{if(reads>=requestLimit)throw Error('PREVIEW_D1_REQUEST_BUDGET');};
 const measure=result=>{for(const r of Array.isArray(result)?result:[result]){queries++;if(!Number.isFinite(r?.meta?.rows_read))unknown=true;else reads+=r.meta.rows_read;writes+=r?.meta?.rows_written||0;}return result;};
 function wrap(statement){const out={bind(...v){return wrap(statement.bind(...v));},async all(){check();return measure(await statement.all());},async run(){check();return measure(await statement.run());},async first(column){const r=await out.all(),row=r.results?.[0]??null;return column&&row?row[column]:row;}};raw.set(out,statement);return out;}
 return {DB:{prepare(sql){check();return wrap(binding.prepare(sql));},async batch(statements){check();return measure(await binding.batch(statements.map(s=>raw.get(s)||s)));}},stats:()=>({reads,writes,queries,unknown})};
}
