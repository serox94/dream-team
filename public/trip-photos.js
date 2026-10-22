(() => {
 const say=(p,e)=>(window.DreamLanguage?.get()||document.documentElement.lang)==='en'?e:p;
 function valid(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&((u.hostname==='photos.app.goo.gl'&&/^\/[A-Za-z0-9_-]+$/.test(u.pathname)&&!u.search)||(u.hostname==='photos.google.com'&&/^\/(?:u\/[0-9]+\/)?(share|album)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)&&[...u.searchParams.keys()].every(k=>k==='key')))?u.href:null;}catch{return null;}}
 function button(trip,cta=false){const url=valid(trip.googlePhotosUrl);return url?`<a class="secondary-btn trip-photos-link" href="${Dream.esc(url)}" target="_blank" rel="noopener noreferrer">📸 ${cta?say('Otwórz album Google Photos','Open Google Photos album'):say('Zdjęcia','Photos')}</a>`:'';}
 function render(){const main=document.querySelector('main');if(!location.pathname.includes('polowy')||!main)return;
  let host=document.getElementById('trip-photos');if(!host){host=document.createElement('section');host.id='trip-photos';host.className='panel-card';main.prepend(host);}
  const trip=window.DREAM_TRIP,url=valid(trip.googlePhotosUrl);
  host.innerHTML=`<div class="trip-photos-copy"><h2>📸 ${say('Zdjęcia z wyjazdu','Trip photos')}</h2><p>${url?say('Wspólne wspomnienia z wyprawy — oglądaj i dodawaj zdjęcia w albumie.','Shared memories from the trip — view and add photos in the album.'):say('Ten wyjazd nie ma jeszcze albumu.','This trip has no album yet.')}</p></div><div class="trip-photos-action">`+(url?button(trip,true):`<a class="secondary-btn trip-photos-link" href="/pages/ustawienia.html">${say('Dodaj link w Ustawieniach','Add a link in Settings')}</a>`)+`</div>`;
 }
 window.DreamPhotos={button,render};document.addEventListener('dream:ready',render);
})();
