(() => {
 const form=document.getElementById('initial-password-form'),error=document.getElementById('password-error');
 form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;error.textContent='';try{
  const response=await fetch('/api/account/password',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept-language':localStorage.getItem('dreamteam.language')||'pl'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
  const data=await response.json();if(!response.ok)throw Error(data.error);form.reset();location.assign('/login');
 }catch(e){error.textContent=e.message;button.disabled=false;}});
 document.getElementById('password-logout').addEventListener('click',async()=>{const r=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});if(r.ok)location.assign('/login');});
})();
