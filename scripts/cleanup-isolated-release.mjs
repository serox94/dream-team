import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {cleanupIsolatedReceipt,safeProviderFailure} from './isolated-release-environment.mjs';
let report;
try{
 const receipt=JSON.parse(await readFile('isolated-adapter-status/ownership.json','utf8'));
 report=await cleanupIsolatedReceipt(receipt,{run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
}catch(e){report=e.code==='ENOENT'?{result:'NO_OWNED_RESOURCES'}:{result:'FAIL',...safeProviderFailure(e)}}
await mkdir('isolated-adapter-status',{recursive:true});await writeFile('isolated-adapter-status/cleanup.json',JSON.stringify(report,null,2));console.log('ISOLATED_CLEANUP '+JSON.stringify(report));if(report.result==='FAIL')process.exitCode=1;
