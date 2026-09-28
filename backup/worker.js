import {WorkflowEntrypoint} from 'cloudflare:workers';
import {exportD1} from './export.mjs';

export class DreamTeamD1Backup extends WorkflowEntrypoint {
  async run(_event,step){return exportD1(this.env,step);}
}

// No publicly accessible backup endpoint.
export default {
  fetch:()=>new Response('Not found',{status:404}),
  scheduled(_event,env,ctx){ctx.waitUntil(env.BACKUP_WORKFLOW.create());}
};
