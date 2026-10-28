/**
 * Word-pair relations, for verbal analogy families.
 *
 * An analogy item is "A is to B as C is to ___". Both pairs must hold the *same*
 * relation or the question has no defensible answer, so the pairs live in banks
 * named after the relation rather than in one big list. Decoys are drawn from a
 * per-relation list of words that are the right part of speech and the wrong
 * relation — which is what makes a distractor tempting instead of filler.
 */
const RELATIONS = {
  opposites: {
    why: 'The pair is a direct opposite',
    pairs: [['hot', 'cold'], ['tall', 'short'], ['early', 'late'], ['full', 'empty'],
      ['loud', 'quiet'], ['rough', 'smooth'], ['heavy', 'light'], ['open', 'shut'],
      ['wet', 'dry'], ['sharp', 'blunt'], ['deep', 'shallow'], ['tight', 'loose']],
    decoys: ['wide', 'heavy', 'high', 'narrow', 'steady', 'bright', 'plain', 'sudden', 'distant'],
  },
  young_adult: {
    why: 'The relation is young animal to adult animal',
    pairs: [['puppy', 'dog'], ['kitten', 'cat'], ['foal', 'horse'], ['calf', 'cow'],
      ['lamb', 'sheep'], ['chick', 'hen'], ['cub', 'bear'], ['duckling', 'duck'],
      ['piglet', 'pig'], ['kid', 'goat'], ['fawn', 'deer'], ['tadpole', 'frog']],
    decoys: ['pet', 'mouse', 'farm', 'herd', 'nest', 'barn', 'fur', 'litter'],
  },
  instrument: {
    why: 'The relation is instrument to the quantity it measures',
    pairs: [['thermometer', 'temperature'], ['barometer', 'pressure'], ['odometer', 'distance'],
      ['scale', 'weight'], ['clock', 'time'], ['ammeter', 'current'], ['anemometer', 'wind speed'],
      ['hygrometer', 'humidity'], ['altimeter', 'altitude'], ['seismometer', 'ground motion']],
    decoys: ['compass', 'ruler', 'telescope', 'magnet', 'lens', 'dial', 'tripod'],
  },
  material: {
    why: 'The second word is the raw material the first one works in',
    pairs: [['sculptor', 'marble'], ['author', 'words'], ['weaver', 'yarn'], ['potter', 'clay'],
      ['carpenter', 'timber'], ['glassblower', 'glass'], ['baker', 'flour'], ['smith', 'iron'],
      ['mason', 'stone'], ['painter', 'pigment']],
    decoys: ['gallery', 'reader', 'publisher', 'studio', 'workshop', 'market', 'kiln', 'toolbox'],
  },
  cause: {
    why: 'The relation is cause to consequence',
    pairs: [['drought', 'famine'], ['recession', 'unemployment'], ['flood', 'evacuation'],
      ['frost', 'crop loss'], ['leak', 'flooding'], ['strike', 'delay'], ['spark', 'fire'],
      ['overload', 'blackout'], ['erosion', 'landslide'], ['glut', 'price fall']],
    // No consequence nouns here: "poverty" was a decoy, and a recession or a drought
    // causes poverty as surely as it causes the keyed answer.
    decoys: ['factory', 'wage', 'season', 'policy', 'report', 'forecast', 'budget', 'calendar'],
  },
  part_whole: {
    why: 'The first is one of the stacked or repeated parts that make up the second',
    pairs: [['page', 'book'], ['floor', 'building'], ['plank', 'deck'], ['rung', 'ladder'],
      ['link', 'chain'], ['stair', 'staircase'], ['slat', 'fence'], ['course', 'wall'],
      ['carriage', 'train'], ['tile', 'roof']],
    decoys: ['brick', 'window', 'cement', 'paint', 'frame', 'nail', 'ink', 'hinge'],
  },
  worker: {
    why: 'The relation is the worker to what they produce',
    pairs: [['baker', 'bread'], ['cobbler', 'shoes'], ['brewer', 'beer'], ['tailor', 'suits'],
      ['vintner', 'wine'], ['cartographer', 'maps'], ['luthier', 'guitars'],
      ['chandler', 'candles'], ['printer', 'books'], ['farrier', 'horseshoes']],
    decoys: ['oven', 'customer', 'shop', 'apprentice', 'invoice', 'bench', 'ledger', 'stall'],
  },
};

/**
 * Turn `{ d, relation }` into a pool family.
 *
 * Two distinct pairs from the same relation make the question; the decoys make
 * the wrong answers. The rationale names the relation and the actual words, so a
 * learner who got it wrong is told what the link was rather than just corrected.
 */
function shuffleRelation(spec) {
  const rel = RELATIONS[spec.relation];
  if (!rel) throw new Error(`no analogy relation "${spec.relation}"`);
  return {
    d: spec.d,
    slots: {
      pairs: (rng) => {
        const picked = rng.shuffle([...rel.pairs]).slice(0, 2);
        return { a: picked[0][0], b: picked[0][1], c: picked[1][0], d: picked[1][1] };
      },
      decoys: (rng, filled) => rng.shuffle(rel.decoys.filter((w) => w !== filled.pairs.d)).slice(0, 3),
    },
    p: (s) => `${s.pairs.a.charAt(0).toUpperCase() + s.pairs.a.slice(1)} is to ${s.pairs.b}`
      + ` as ${s.pairs.c} is to ___`,
    c: (s) => [s.pairs.d, ...s.decoys],
    a: (s) => s.pairs.d,
    r: (s) => `${rel.why}: ${s.pairs.a} to ${s.pairs.b}, and so ${s.pairs.c} to ${s.pairs.d}.`,
  };
}

module.exports = { RELATIONS, shuffleRelation };
