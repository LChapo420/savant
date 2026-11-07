/* /offline.html under UI_V2 (services/ui-v2.js): the giraffe says it. No app script is needed; js/offline.js keeps its Try again. */
(function () {
  const start = () => {
    const h1 = document.querySelector('main h1');
    if (!h1 || !window.U2Look || !window.Tutor) return;
    const g = document.createElement('div');
    g.className = 'u2-off-g';
    h1.before(g);
    window.U2Look.giraffe(g, { crop: 'full', mood: 'think' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());
