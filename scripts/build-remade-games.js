/** Builds only the tiny, curriculum-free entry fragments for shared engines. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const registry = require('../game_registry.json');
for (const engine of registry.engines) {
  if (engine.id === 'tetris') continue;
  const html = `<link rel="stylesheet" href="/games/remade.css">
<div id="game-root"></div>
<script src="/games/remade.js"></script>
<script src="/games/boards.js"></script>
<script src="/games/arcade.js"></script>
<script>
window.GAME_ID = '${engine.id}';
window.GAME_DATA = [/* __DATA_INJECTION__ */][0];
window.initGame = function (payload) { window.RemadeGames.start(window.GAME_ID, payload); };
if (window.GAME_DATA) window.initGame(window.GAME_DATA);
</script>
`;
  fs.writeFileSync(path.join(root, 'public', 'games', 'engines', `${engine.id}.html`), html);
}
console.log('Built 39 shared-engine entry fragments; Tetris kept unchanged.');