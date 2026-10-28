(async function () {
  'use strict';
  const id = document.body.dataset.engine;
  const response = await fetch(`/api/game-lab/${encodeURIComponent(id)}/payload`);
  if (!response.ok) { document.body.textContent = 'The test content could not be loaded.'; return; }
  const payload = await response.json();
  const key = `polymath.lab.cursor.${id}`;
  let at = 0;
  try { at = Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { /* no storage */ }
  window.PolymathGame = {
    nextLevelUrl: '/game-lab',
    cursor: { at, next(total) { const index = this.at % total; const wrapped = this.at > 0 && index === 0; this.at++; try { localStorage.setItem(key, String(this.at)); } catch { /* in-memory */ } return { index, wrapped }; } },
  };
  ['answer', 'win', 'lose', 'draw'].forEach((name) => window.addEventListener(`game:${name}`, (event) => {
    const detail = event.detail || {};
    parent.postMessage({ type: 'polymath:lab', text: name === 'answer' ? `${detail.questionId}: ${detail.correct ? 'correct' : 'incorrect'} · ${detail.ms} ms` : `${name}: ${detail.correct || 0} correct, ${detail.wrong || 0} incorrect` }, location.origin);
  }));
  window.initGame(payload);
}());