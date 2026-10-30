/* The offline page: one button that reloads once the network is back. */
(function () {
  const btn = document.getElementById('retry');
  if (btn) btn.addEventListener('click', () => { location.href = '/'; });
  window.addEventListener('online', () => { location.href = '/'; });
})();
