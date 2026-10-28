/**
 * A learner's puzzle rating: Glicko-2 (Glickman, "Example of the Glicko-2 system", 2012).
 *
 * Each solved or failed puzzle is one game between the learner and the puzzle.
 * The puzzle's rating is fixed (it is our estimate, set when the puzzle was made);
 * only the learner's rating, deviation and volatility move. A new learner starts
 * uncertain (deviation 350), so the first dozen puzzles move the rating a lot and
 * later ones settle it.
 *
 * Written from the published description of the method; no code was copied.
 */
const SCALE = 173.7178;
const TAU = 0.5; // how much the volatility may change; Glickman suggests 0.3-1.2
const EPSILON = 0.000001;

const START = { rating: 1000, rd: 350, vol: 0.06 };
const MIN_RD = 45; // a floor, so a rating never stops reacting to new results
const MAX_RD = 350;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * The learner's new rating after one or more results.
 *
 * @param {{rating:number, rd:number, vol:number}} player
 * @param {Array<{rating:number, rd:number, score:number}>} games score 1 = solved, 0 = failed
 * @returns {{rating:number, rd:number, vol:number}}
 */
function update(player, games) {
  const p = { ...START, ...(player || {}) };
  const mu = (p.rating - 1500) / SCALE;
  const phi = p.rd / SCALE;
  const sigma = p.vol;
  if (!games || !games.length) {
    // A rating period with no games: only the deviation grows.
    const grown = Math.min(MAX_RD, Math.sqrt(phi * phi + sigma * sigma) * SCALE);
    return { rating: p.rating, rd: grown, vol: sigma };
  }
  let vInv = 0;
  let deltaSum = 0;
  for (const game of games) {
    const muJ = (game.rating - 1500) / SCALE;
    const phiJ = (game.rd || 0) / SCALE;
    const e = expected(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
    deltaSum += gj * (game.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // The new volatility, by the Illinois method on f(x) = 0 (step 5 of the paper).
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 100) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > EPSILON; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;
  return {
    rating: 1500 + SCALE * newMu,
    rd: Math.max(MIN_RD, Math.min(MAX_RD, SCALE * newPhi)),
    vol: newSigma,
  };
}

/** How likely the learner is to solve a puzzle of this rating, 0-1. */
function solveChance(player, puzzleRating, puzzleRd = 0) {
  const p = { ...START, ...(player || {}) };
  return expected((p.rating - 1500) / SCALE, (puzzleRating - 1500) / SCALE, puzzleRd / SCALE);
}

module.exports = { START, update, solveChance, SCALE, TAU };
