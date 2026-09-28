import {cp,mkdir,readdir,readFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
await mkdir('public/vendor',{recursive:true});
await cp('node_modules/chart.js/dist/chart.umd.js','public/vendor/chart.umd.js');
await cp('node_modules/chart.js/LICENSE.md','public/vendor/chart.LICENSE.md');
await cp('node_modules/chart.js/dist/chart.umd.js.map','public/vendor/chart.umd.js.map');
for(const directory of ['src','public'])for(const file of await readdir(directory))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',path.join(directory,file)]);
const pages=['public/index.html',...(await readdir('public/pages')).filter(f=>f.endsWith('.html')).map(f=>'public/pages/'+f)];
for(const file of pages){
 const html=await readFile(file,'utf8');
 if((html.match(/dream-loader-v2\.js/g)||[]).length!==1)throw Error('Exactly one loader required: '+file);
 for(const [,url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(https?:|mailto:|tel:)/.test(url))continue;
  const clean=decodeURIComponent(url.split(/[?#]/)[0]);
  await access(clean.startsWith('/')?'public'+clean:path.join(path.dirname(file),clean));
 }
}
console.log(`Validated JavaScript and local links for ${pages.length} pages; bundled Chart.js 4.5.1.`);
