(() => {
  const error=new URLSearchParams(location.search).get('error');
  if(!error)return;
  const box=document.getElementById('login-error');
  box.textContent=error==='limit'?'Zbyt wiele prób. Spróbuj ponownie za 15 minut.':'Nieprawidłowy login lub hasło.';
  box.hidden=false;
})();
