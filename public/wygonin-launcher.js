(() => {
  const path = location.pathname.replace(/\.html$/, '');
  if (!path.endsWith('/pages/porady') && !path.endsWith('/pages/regulamin')) return;

  let tries = 0;
  const start = () => {
    tries += 1;
    if (window.DREAM_TRIP?.id === 'poland-2027') {
      if (document.querySelector('script[data-wygonin-ready="1"]')) return;
      const script = document.createElement('script');
      script.src = `/wygonin-encyclopedia.js?v=2`;
      script.dataset.wygoninReady = '1';
      document.body.appendChild(script);
      return;
    }
    if (window.DREAM_TRIP && window.DREAM_TRIP.id !== 'poland-2027') return;
    if (tries < 120) setTimeout(start, 50);
  };
  start();
})();
