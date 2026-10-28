App.mount(async () => {
  App.header(await App.currentUser(), 'games');
  const list = await App.api.get('/api/game-lab');
  const host = document.getElementById('lab-games');
  const frame = document.getElementById('lab-frame');
  let current = null;
  function render(query = '') {
    const engines = list.games.filter((game) => game.name.toLowerCase().includes(query.toLowerCase()));
    host.replaceChildren();
    for (const game of engines) {
      const card = App.el('div', { class: 'card lab-card' });
      const title = document.createElement('strong'); title.textContent = game.name;
      const info = document.createElement('span'); info.className = 'small muted'; info.textContent = game.status === 'ready' ? 'Rebuilt · gameplay checks passed' : 'Under test';
      const play = document.createElement('button'); play.type = 'button'; play.className = 'btn btn-primary'; play.textContent = 'Test game'; play.disabled = game.status !== 'ready';
      play.addEventListener('click', () => open(game)); card.append(title, info, play); host.append(card);
    }
    document.getElementById('lab-count').textContent = `${list.games.filter((g) => g.status === 'ready').length} / ${list.games.length} ready`;
  }
  function open(game) {
    current = game;
    document.getElementById('lab-title').textContent = game.name;
    document.getElementById('lab-rules').textContent = game.mechanic;
    document.getElementById('lab-player').hidden = false;
    // Moto X3M is a landscape 3:2 Phaser game. Give its frame a matching aspect
    // ratio (instead of the tall default) so the game fills the frame on mobile
    // rather than sitting in a big black block.
    if (game.id === 'moto-x3m') {
      frame.style.height = 'auto';
      frame.style.aspectRatio = '3 / 2';
    } else {
      frame.style.height = '';
      frame.style.aspectRatio = '';
    }
    frame.src = `/game-lab/play/${encodeURIComponent(game.id)}`;
    document.getElementById('lab-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.getElementById('game-search').addEventListener('input', (event) => render(event.target.value));
  document.getElementById('lab-close').addEventListener('click', () => { frame.src = 'about:blank'; current = null; document.getElementById('lab-player').hidden = true; });
  document.getElementById('lab-reset').addEventListener('click', () => {
    if (!current) return;
    localStorage.removeItem(`polymath.lab.cursor.${current.id}`); open(current);
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow || !event.data || event.data.type !== 'polymath:lab') return;
    document.getElementById('lab-telemetry').textContent = event.data.text;
  });
  document.getElementById('lab-prompt').textContent = list.prompt;
  document.getElementById('lab-status').textContent = list.contentSource;
  render();
});