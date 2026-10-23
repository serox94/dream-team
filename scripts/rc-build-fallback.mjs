// Known production feature code, upgraded only for schema31 and the approved
// shared-login policy. Research writes/provider calls are disabled in fallback.
import {execFileSync} from 'node:child_process';import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';import {join} from 'node:path';
export async function buildFallback(directory){
 await mkdir(directory,{recursive:true});const archive=execFileSync('git',['archive','d880491e4aa53a12a4034f54507582a9d165daf2'],{maxBuffer:128*1024*1024});execFileSync('tar',['-x','-C',directory],{input:archive,stdio:['pipe','pipe','pipe']});
 const files=['src/auth.js','src/ensure-schema.js','src/automatic-translations.js','src/content-translations.js','public/settings.js','public/account-password.html','public/account-password.js','public/content-translations.js','public/locales/runtime.en.json','public/sw.js'];for(const file of files)await copyFile(file,join(directory,file));
 // git archive excludes generated vendor assets; recovery needs the same local
 // Chart.js/SunCalc assets as the main build, including offline startup.
 await mkdir(join(directory,'public/vendor'),{recursive:true});for(const[from,to]of [['node_modules/suncalc/suncalc.js','suncalc.js'],['node_modules/suncalc/LICENSE','suncalc.LICENSE'],['node_modules/chart.js/dist/chart.umd.js','chart.umd.js'],['node_modules/chart.js/LICENSE.md','chart.LICENSE.md'],['node_modules/chart.js/dist/chart.umd.js.map','chart.umd.js.map']])await copyFile(from,join(directory,'public/vendor',to));
 // The hotfix worker is the production worker with its forced-password gate removed.
 await writeFile(join(directory,'src/worker.js'),execFileSync('git',['show','066e47b8bf60f113f061ce2c9e0dc3d5eb4c247b:src/worker.js']));
 const entry=join(directory,'schema31-fallback.mjs');await writeFile(entry,`import app from './src/worker.js';export default{fetch(r,e,c){const p=new URL(r.url).pathname;if(p==='/api/lake-candidates'||/^\\/api\\/lakes\\/[^/]+\\/(research|candidates)$/.test(p))return Response.json({ok:false,error:'Research temporarily paused during recovery.'},{status:503});return app.fetch(r,{...e,TAVILY_API_KEY:undefined},c);},scheduled(){}};`);
 const sw=join(directory,'public/sw.js');await writeFile(sw,(await readFile(sw,'utf8')).replace('release-candidate-1','schema31-fallback-1'));return entry;
}
