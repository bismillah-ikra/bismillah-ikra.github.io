(function () {
  'use strict';
  const current = document.querySelector('meta[name="site-release"]')?.content;
  if (!current || !['http:', 'https:'].includes(location.protocol)) return;
  const manifest = new URL('../release.json', document.currentScript.src);
  let checking = false;
  let updating = false;
  let lastCheck = 0;

  window.SiteRelease = {
    start(canReload) {
      async function check(force = false) {
        if (document.hidden || checking || updating || (!force && Date.now() - lastCheck < 3000)) return;
        checking = true;
        lastCheck = Date.now();
        try {
          manifest.searchParams.set('check', String(lastCheck));
          const response = await fetch(manifest, { cache: 'no-store' });
          if (!response.ok) return;
          const { release } = await response.json();
          if (typeof release !== 'string' || !/^[a-f0-9-]{36}$/.test(release) || release === current || document.hidden) return;
          const page = new URL(location.href);
          if (page.searchParams.get('release') === release || !canReload()) return;
          page.searchParams.set('release', release);
          updating = true;
          location.replace(page.href);
        } catch {
          // Keep the current page usable when the release check is unavailable.
        } finally {
          checking = false;
        }
      }

      window.addEventListener('hashchange', () => check(true));
      window.addEventListener('pageshow', event => check(event.persisted));
      window.addEventListener('focus', () => check());
      document.addEventListener('visibilitychange', () => check());
      check();
    }
  };
})();
