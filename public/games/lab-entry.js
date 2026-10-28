window.GAME_ID = document.body.dataset.engine;
window.initGame = function (payload) { window.RemadeGames.start(window.GAME_ID, payload); };