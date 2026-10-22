// Appearance preference only: no account, network or application-data changes.
(() => {
  const root = document.documentElement, key = 'dreamteam.theme';
  let theme = 'dark', frame;
  try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch {}
  const en = () => root.lang === 'en';
  function label() {
    const button = document.getElementById('dream-theme-toggle');
    if (!button) return;
    button.setAttribute('aria-checked', String(theme === 'light'));
    button.setAttribute('aria-label', en() ? 'Light theme' : 'Jasny motyw');
    button.title = theme === 'light'
      ? (en() ? 'Switch to dark theme' : 'Włącz ciemny motyw')
      : (en() ? 'Switch to light theme' : 'Włącz jasny motyw');
    button.firstElementChild.textContent = theme === 'light' ? '☀️' : '🌙';
  }
  function apply(value, persist = false) {
    theme = value === 'light' ? 'light' : 'dark';
    root.dataset.themeSwitching = '';
    root.dataset.theme = theme;
    root.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f4eb' : '#0b100e');
    if (persist) { try { localStorage.setItem(key, theme); } catch {} }
    label();
    // Existing hover transitions must not tween dark surfaces through low-contrast grey.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => delete root.dataset.themeSwitching);
    });
    window.dispatchEvent(new CustomEvent('dream:theme-change', {detail: {theme}}));
  }
  apply(theme);
  function mount() {
    const host = document.querySelector('.header-top, .login-card');
    if (!host || document.getElementById('dream-theme-toggle')) return;
    const button = document.createElement('button');
    button.id = 'dream-theme-toggle'; button.type = 'button'; button.setAttribute('role', 'switch');
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    button.addEventListener('click', () => apply(theme === 'dark' ? 'light' : 'dark', true));
    host.append(button); label();
  }
  window.DreamTheme = Object.freeze({get: () => theme, set: value => apply(value, true)});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
  new MutationObserver(label).observe(root, {attributes: true, attributeFilter: ['lang']});
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue); });
})();
