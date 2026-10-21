// Runs before first paint so the page never flashes the wrong theme.
try {
  var s = (JSON.parse(localStorage.getItem('taskbook.v2') || '{}').state || {}).settings || {};
  var t = s.theme || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (s.accent) document.documentElement.dataset.accent = s.accent;
} catch (e) {}
