(() => {
  const form = document.getElementById('catch-form');
  if (!form) return;
  form.addEventListener('submit', () => {
    const spot = document.getElementById('spot');
    const spotId = document.getElementById('spot-id');
    if (spot && !spot.value.trim() && !spotId?.value) spot.value = 'Brak';
  }, true);
})();
