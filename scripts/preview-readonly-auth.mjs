// Dedicated account/language jobs cover login UI. These feature jobs use real API sessions.
import assert from 'node:assert/strict';
export async function authenticateReadOnly(context,base,lang,username=process.env.RYBY_LOGIN_USERNAME){
 await context.addInitScript(language=>localStorage.setItem('dreamteam.language',language),lang);
 const response=await context.request.post(base+'/api/login',{maxRedirects:0,timeout:25000,headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},form:{username,password:process.env.RYBY_LOGIN_PASSWORD}});
 assert.equal(response.status(),303,'real preview credentials accepted');
 assert.ok((await context.cookies(base)).some(c=>c.name==='__Host-ryby_session'&&c.httpOnly&&c.secure),'real protected session cookie');
}
