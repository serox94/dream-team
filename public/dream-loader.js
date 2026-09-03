(async () => {
  async function loadScript(src) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function bindMobileMenu() {
    document.querySelectorAll('.menu-toggle').forEach(button => {
      if (button.dataset.dreamMenuBound === '1') return;
      button.dataset.dreamMenuBound = '1';
      const wrap = button.closest('.mobile-nav-wrap') || button.parentElement;
      const nav = wrap?.querySelector('.main-nav') || document.querySelector('.main-nav');
      if (!nav) return;

      button.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const open = nav.classList.toggle('open');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        nav.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      }));
    });
  }

  bindMobileMenu();
  document.addEventListener('DOMContentLoaded', bindMobileMenu, { once: true });

  try {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    const model = await response.json();
    const trip = model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
    window.DREAM_MODEL = model;
    window.DREAM_TRIP = trip || null;

    if (trip) {
      document.title = document.title.replace('Ryby 2026', 'Dream Team');
      document.querySelectorAll('.site-header h1').forEach(el => el.textContent = 'Dream Team');
      document.querySelectorAll('.subtitle').forEach(el => el.textContent = trip.lake || 'Dream Team');

      const format = value => value ? new Intl.DateTimeFormat('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(new Date(value)) : '—';

      document.querySelectorAll('.trip-box').forEach(box => {
        const rows = box.querySelectorAll('div');
        if (rows[0]) rows[0].innerHTML = `<strong>Wyjazd:</strong> ${format(trip.start)}`;
        if (rows[1]) rows[1].innerHTML = `<strong>Powrót:</strong> ${format(trip.end)}`;
      });

      const headerTop = document.querySelector('.header-top > div:first-child');
      if (headerTop && model.trips.length > 1) {
        const select = document.createElement('select');
        select.className = 'dream-trip-select';
        select.setAttribute('aria-label', 'Aktywny wyjazd');
        for (const t of model.trips) {
          const option = document.createElement('option');
          option.value = t.id;
          option.textContent = `${t.year} · ${t.lake}${t.status === 'archived' ? ' · archiwum' : ''}`;
          option.selected = t.id === trip.id;
          select.appendChild(option);
        }
        select.addEventListener('change', async () => {
          select.disabled = true;
          await fetch(`/api/trips/${encodeURIComponent(select.value)}/activate`, { method: 'POST' });
          location.reload();
        });
        headerTop.appendChild(select);
      }

      const countdown = document.getElementById('countdown');
      if (countdown) {
        const update = () => {
          if (!trip.start) { countdown.innerHTML = '<strong>Status:</strong> termin do ustawienia'; return; }
          const now = Date.now();
          const start = new Date(trip.start).getTime();
          const end = trip.end ? new Date(trip.end).getTime() : start;
          if (now > end) countdown.innerHTML = '<strong>Status:</strong> zakończony';
          else if (now >= start) countdown.innerHTML = '<strong>Status:</strong> trwa';
          else {
            const days = Math.ceil((start - now) / 86400000);
            countdown.innerHTML = `<strong>Status:</strong> ${days} dni do wyjazdu`;
          }
        };
        update();
        setInterval(update, 60000);
      }
    }

    await loadScript('/d1-supabase-compat.js');
    await loadScript('/app.js');
    if (document.querySelector('[data-use-fixes]') || location.pathname.includes('pogoda')) await loadScript('/fixes.js').catch(() => {});
    await loadScript('/app-plus.js').catch(() => {});
    if (document.getElementById('fishChart')) await loadScript('/dashboard-chart.js').catch(() => {});
    bindMobileMenu();
  } catch (error) {
    console.error('Dream Team loader failed', error);
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin', `<div class="container"><div class="empty-box">Błą̨d uruchamiania Dream Team: ${String(error.message || error)}</div></div>`);
  }
})();