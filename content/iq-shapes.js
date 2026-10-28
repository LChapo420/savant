/**
 * IQ question shapes: the same reasoning asked a different way.
 *
 * An IQ generator is unlike a math one — the answer cannot simply be computed
 * from a rule, because the rule is what the learner is being asked to find. So
 * the shape has to be the *kind of finding*: a rule to name, an odd one out, a
 * next term, the step between two, a claim to judge. A series generator that
 * always asks "what comes next" is one question with a thousand answers, and a
 * learner meets it a hundred times without noticing there was anything else to
 * do with the numbers.
 *
 * Everything here is still verifiable: the answer is either computed, or it is
 * one of the options the generator itself wrote, and
 * scripts/iq-template-audit.js re-solves every shape from its rendered prompt.
 * That audit is why several shapes below read differently from their first
 * versions — "A cube has 4 faces" as a premise, a "which pair matches" whose key
 * came from a different relation than the question's, a word "removed" from a
 * word that was printed whole, a set of "things that can fly" with a dolphin in
 * it. Each fix keeps the shape's purpose and changes only what made it untrue.
 */
const { onlyOdd } = require('./iq-oddity');

const item = (o) => ({ source: 'bank', ...o });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const an = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const shift = (ch, by) => LETTERS[(((LETTERS.indexOf(ch) + by) % 26) + 26) % 26];

const WORDS = ['apple', 'river', 'stone', 'cloud', 'chair', 'bread', 'glass', 'field',
  'music', 'paper', 'garden', 'winter', 'silver', 'market', 'copper', 'letter',
  'island', 'furnace', 'candle', 'meadow', 'harbour', 'tunnel', 'blanket', 'anchor'];

/**
 * A set where three share a property and one does not, with the reason named.
 *
 * Every member of every list really has the property: an earlier "can fly" list
 * held a caterpillar and a dolphin, and "served hot" held water and juice. And
 * no list mixes in a word that starts with a vowel, because "begins with a vowel
 * sound" is itself one of the rules, and a lone "iron" among "copper, wood,
 * water" would then be a second odd one out.
 */
const ODD_SETS = [
  {
    build(rng) {
      const vowels = rng.shuffle(['apple', 'eagle', 'otter', 'iguana', 'urn', 'axle']);
      return { three: vowels.slice(0, 3), odd: 'puzzle', why: 'the other three begin with a vowel sound' };
    },
  },
  {
    build(rng) {
      // Even numbers against 15, drawn until 15 is the only odd one: 6, 12 and
      // 15 are all multiples of 3, which made 10 a second answer.
      let three = [];
      for (let tries = 0; tries < 200 && !(three.length && onlyOdd([...three, 15], 15)); tries++) {
        three = rng.shuffle([4, 8, 16, 6, 10, 12, 14, 18, 22]).slice(0, 3);
      }
      if (!onlyOdd([...three, 15], 15)) three = [4, 8, 16];
      return { three: three.map(String), odd: '15', why: 'the other three are even' };
    },
  },
  {
    build(rng) {
      const hot = rng.shuffle(['tea', 'coffee', 'cocoa', 'soup', 'porridge', 'broth']);
      return { three: hot.slice(0, 3), odd: 'lemonade', why: 'the other three are usually served hot' };
    },
  },
  {
    build(rng) {
      const fliers = rng.shuffle(['butterfly', 'woodpecker', 'hummingbird', 'bee', 'bat', 'sparrow']);
      return { three: fliers.slice(0, 3), odd: 'goldfish', why: 'the other three can fly' };
    },
  },
  {
    build(rng) {
      const solids = rng.shuffle(['copper', 'wood', 'salt', 'glass', 'silver', 'stone']);
      return { three: solids.slice(0, 3), odd: 'water', why: 'the other three are solid at room temperature' };
    },
  },
];
const ALL_WHYS = ['the other three begin with a vowel sound', 'the other three are even',
  'the other three are usually served hot', 'the other three can fly',
  'the other three are solid at room temperature'];

const SHAPES = {
  // ── number series ────────────────────────────────────────────────────────
  number_series(rng, d) {
    const roll = rng.int(0, 4);
    const start = rng.int(1, 20);
    const step = rng.int(2, 12);

    if (roll === 0) {
      // Name the rule, not the next term. Finding the pattern and extending it
      // are two different acts, and only the first is being tested here.
      const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
      return item({
        format: 'multiple_choice',
        prompt: `Which rule fits ${seq.join(', ')}?`,
        choices: rng.shuffle([
          `Each term is ${step} more than the one before`,
          `Each term is ${step + 1} more than the one before`,
          `Each term is twice the one before`,
          `The terms are in no pattern`,
        ]),
        answer: `Each term is ${step} more than the one before`,
        rationale: `The gaps are all ${step}.`,
      });
    }

    if (roll === 1) {
      // The step between two terms, which is a different question from the
      // sixth term.
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return item({
        format: 'type_in',
        prompt: `In the series ${seq.join(', ')}, by how much does each term increase?`,
        answer: String(step),
        rationale: `${seq[1]} − ${seq[0]} is ${step}, and so is every other gap.`,
      });
    }

    if (roll === 2) {
      // A term that does not belong, which is the odd-one-out task applied to
      // a series rather than a set.
      const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
      const wrongAt = rng.int(1, 4);
      const broken = [...seq];
      broken[wrongAt] += rng.int(1, 6) * (rng.bool() ? 1 : -1);
      return item({
        format: 'type_in',
        prompt: `In ${broken.join(', ')}, which position breaks the pattern? Give the position number, 1 to 5.`,
        answer: String(wrongAt + 1),
        rationale: `The others go up by ${step} each time, so position ${wrongAt + 1} should be ${seq[wrongAt]}, not ${broken[wrongAt]}.`,
      });
    }

    if (roll === 3) {
      // Doubling, a different rule rather than the same one with other numbers.
      const s = rng.int(2, 6);
      const seq = [0, 1, 2, 3].map((i) => s * Math.pow(2, i));
      return item({
        format: 'type_in',
        prompt: `What comes next?\n${seq.join(', ')}, ___`,
        answer: String(seq[3] * 2),
        rationale: `Each term is twice the one before, so the next is ${seq[3] * 2}.`,
      });
    }

    const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
    return item({
      format: 'type_in',
      prompt: `What comes next?\n${seq.join(', ')}, ___`,
      answer: String(seq[4] + step),
      rationale: `Each term is ${step} more, so the next is ${seq[4] + step}.`,
    });
  },

  // ── odd one out ──────────────────────────────────────────────────────────
  odd_one_out(rng, d) {
    const roll = rng.int(0, 3);
    const set = rng.pick(ODD_SETS).build(rng);
    const all = rng.shuffle([...set.three, set.odd]);

    if (roll === 0) {
      // Why, not which: a learner who can name the rule does not need to
      // rescan the list, and naming it is the transferable half of the skill.
      // The other reasons are the other sets' rules, each plainly false here.
      const others = rng.shuffle(ALL_WHYS.filter((w) => w !== set.why)).slice(0, 3);
      return item({
        format: 'multiple_choice',
        prompt: `In ${all.join(', ')}, the odd one out is ${set.odd}. Which reason explains why?`,
        choices: rng.shuffle([set.why, ...others].map(capital)),
        answer: capital(set.why),
        rationale: `${capital(set.why)}, and ${set.odd} does not fit that rule.`,
      });
    }

    if (roll === 1) {
      // Three out of four, which is a stricter discrimination than one out of
      // four: any of the three is right, and the grader has to know all of them.
      return item({
        format: 'type_in',
        prompt: `In ${all.join(', ')}, three of them belong together. Name one of those three.`,
        answer: set.three[0],
        accepts: set.three.slice(1),
        rationale: `${capital(set.odd)} is the odd one out, because ${set.why}. So ${set.three.join(', ')}`
          + ' are the three, and any one of them is right.',
      });
    }

    if (roll === 2) {
      // An arithmetic set, where the property is checkable rather than judged.
      // Drawn until the odd number is the only odd one out: 3 among 6, 12, 18
      // is, but 9 among 4, 16, 8 is not (4, 16 and 9 are all squares).
      let three = [];
      let odd = '';
      for (let tries = 0; tries < 400 && !(three.length && onlyOdd([...three, Number(odd)], Number(odd))); tries++) {
        three = rng.shuffle([2, 4, 8, 6, 10, 12, 14, 16, 18, 20]).slice(0, 3);
        odd = rng.pick(['3', '5', '7', '9', '11', '15']);
      }
      if (!onlyOdd([...three, Number(odd)], Number(odd))) { three = [10, 14, 16]; odd = '13'; }
      const shown = rng.shuffle([...three.map(String), odd]);
      return item({
        format: 'multiple_choice',
        prompt: `Which is the odd one out: ${shown.join(', ')}?`,
        choices: shown,
        answer: odd,
        rationale: `${odd} is odd, and the other three are even.`,
      });
    }

    return item({
      format: 'multiple_choice',
      prompt: `Which is the odd one out: ${all.join(', ')}?`,
      choices: all,
      answer: set.odd,
      rationale: `${capital(set.odd)} is the odd one out: ${set.why}.`,
    });
  },

  // ── matrices ─────────────────────────────────────────────────────────────
  matrix_pattern(rng, d) {
    const roll = rng.int(0, 3);
    const a = rng.int(1, 5);
    const b = rng.int(1, 5);

    if (roll === 0) {
      // Each row adds, which is the same finding as a series but across three
      // columns, so it reads as a different skill.
      const rows = [0, 1, 2].map((r) => [a + r * 2, a + r * 2 + b, a + r * 2 + b + b]);
      const next = [a + 6, a + 6 + b, a + 6 + b + b];
      return item({
        format: 'type_in',
        prompt: `In each row, the numbers add the same amount going right.\n`
          + `${rows.map((r) => r.join('  ')).join('\n')}\n___  ___  ___\n`
          + 'What is the next row? Enter the three numbers separated by spaces.',
        answer: next.join(' '),
        accepts: [next.join(', '), next.join(',')],
        rationale: `Each row starts 2 more than the row above, and each row adds ${b} going right,`
          + ` so the next row is ${next.join(', ')}.`,
      });
    }

    if (roll === 1) {
      // Read one property of the whole grid, which is a different question from
      // completing it. The blank is "___": a "?" was printed glued to the 8.
      return item({
        format: 'multiple_choice',
        prompt: 'What goes in the blank?\n\n1  2  3\n4  5  6\n7  8  ___',
        choices: rng.shuffle(['9', '7', '0', '10']),
        answer: '9',
        rationale: 'The numbers count up by one along each row, so 7, 8 is followed by 9.',
      });
    }

    if (roll === 2) {
      // Multiplying along a row, which is a different rule to adding. The rows
      // are built with the multiplier the prompt states: they used to be doubled
      // whatever the prompt said, so "3 times" sat over 2, 4, 5.
      const s = rng.int(1, 4);
      const k = rng.int(2, 4);
      const row = (x) => `${x}  ${x * k}  ${x * k + 1}`;
      const ans = [(s + 2) * k, (s + 2) * k + 1];
      return item({
        format: 'type_in',
        prompt: `In each row, the second number is ${k} times the first, and the third is the second plus one.\n`
          + `${row(s)}\n${row(s + 1)}\n${s + 2}  ___  ___\n`
          + 'Enter the two missing numbers separated by a space.',
        answer: ans.join(' '),
        accepts: [ans.join(', '), ans.join(',')],
        rationale: `${s + 2} × ${k} gives ${ans[0]}, and one more gives ${ans[1]}.`,
      });
    }

    const x = rng.int(1, 6);
    return item({
      format: 'type_in',
      prompt: `What number replaces the blank?\n${x}  ${x + 2}  ${x + 4}\n${x + 1}  ${x + 3}  ___\n${x + 2}  ${x + 4}  ${x + 6}`,
      answer: String(x + 5),
      rationale: `Each row adds 2 going right and each column adds 1 going down, so the blank is ${x + 3} + 2 = ${x + 5}.`,
    });
  },

  // ── verbal analogies ─────────────────────────────────────────────────────
  verbal_analogy(rng, d) {
    const roll = rng.int(0, 3);
    const { RELATIONS } = require('./relations');
    // Two draws from the same relation, which is what an analogy is: one link
    // established, the same link asked about in a new case.
    const draw = (rel) => {
      const picked = rng.shuffle([...rel.pairs]).slice(0, 2);
      return { a: picked[0][0], b: picked[0][1], c: picked[1][0], d: picked[1][1] };
    };
    const rels = Object.values(RELATIONS);
    const rel = rng.pick(rels);
    const pick = draw(rel);
    const others = rng.shuffle(rels.filter((r) => r !== rel));

    if (roll === 0) {
      // State the relation, which is what makes an analogy transferable. The
      // wrong options are the other relations, each false for this pair.
      return item({
        format: 'multiple_choice',
        prompt: `"${capital(pick.a)} is to ${pick.b} as ${pick.c} is to ___" — what is the relation between ${pick.a} and ${pick.b}?`,
        choices: rng.shuffle([rel.why, ...others.slice(0, 3).map((r) => r.why)]),
        answer: rel.why,
        rationale: `${rel.why}: ${pick.a} to ${pick.b}, as ${pick.c} to ${pick.d}.`,
      });
    }

    if (roll === 1) {
      // Word pairs, which is the reverse: find the pair that matches. The key is
      // the second pair of the *same* relation; the distractors are pairs from
      // three other relations, which hold a link, just not this one.
      const answer = `${pick.c} and ${pick.d}`;
      const distractors = others.slice(0, 3).map((r) => { const e = draw(r); return `${e.a} and ${e.b}`; });
      return item({
        format: 'multiple_choice',
        prompt: `Which pair has the same relationship as ${pick.a} and ${pick.b}?`,
        choices: rng.shuffle([answer, ...distractors]),
        answer,
        rationale: `${rel.why}: ${pick.a} to ${pick.b}, as ${pick.c} to ${pick.d}.`,
      });
    }

    if (roll === 2) {
      // Which pair breaks the link, which is a check rather than a construction:
      // three more pairs of the same relation, and one from another.
      const same = rng.shuffle(rel.pairs.filter(([x]) => x !== pick.a)).slice(0, 3).map(([x, y]) => `${x} and ${y}`);
      const other = others[0];
      const e = draw(other);
      const answer = `${e.a} and ${e.b}`;
      return item({
        format: 'multiple_choice',
        prompt: `Which pair does NOT show the same relationship as ${pick.a} and ${pick.b}?`,
        choices: rng.shuffle([answer, ...same]),
        answer,
        rationale: `${capital(e.a)} and ${e.b} have a different link (${lowerFirst(other.why)}).`
          + ` The other pairs share the link between ${pick.a} and ${pick.b}: ${lowerFirst(rel.why)}.`,
      });
    }

    const decoys = rng.shuffle(rel.decoys.filter((w) => w !== pick.d)).slice(0, 3);
    return item({
      format: 'multiple_choice',
      prompt: `${capital(pick.a)} is to ${pick.b} as ${pick.c} is to ___`,
      choices: rng.shuffle([pick.d, ...decoys]),
      answer: pick.d,
      rationale: `${rel.why}: ${pick.a} to ${pick.b}, and so ${pick.c} to ${pick.d}.`,
    });
  },

  // ── deductive puzzles ────────────────────────────────────────────────────
  logic_deduction(rng, d) {
    const roll = rng.int(0, 3);
    const names = rng.shuffle(['Ada', 'Bryn', 'Cass', 'Dev', 'Elin', 'Faro', 'Gale', 'Hana']);
    const [a, b, c] = names;

    if (roll === 0) {
      // Who was where, stated and solved: a different act from "what follows".
      return item({
        format: 'type_in',
        prompt: `${a}, ${b}, and ${c} each ran one of three legs: north, south, east. `
          + `${a} ran north, ${b} did not run north, and ${c} ran east. `
          + 'Who ran south?',
        answer: b,
        rationale: `${a} has north and ${c} has east, so ${b} is left with south.`,
      });
    }

    if (roll === 1) {
      // A chain of comparisons, and which claim it forces.
      return item({
        format: 'multiple_choice',
        prompt: `${a} is taller than ${b}. ${b} is taller than ${c}. Which must be true?`,
        choices: rng.shuffle([`${a} is taller than ${c}`, `${c} is taller than ${a}`,
          `${b} is the shortest`, 'Nothing follows']),
        answer: `${a} is taller than ${c}`,
        rationale: `${a} is taller than ${b}, and ${b} is taller than ${c}, so ${a} is taller than ${c}.`,
      });
    }

    if (roll === 2) {
      // Counting by elimination, stated as a question about a position.
      return item({
        format: 'type_in',
        prompt: `${a}, ${b}, ${c}, and ${names[3]} finished a race in that order, with no ties. `
          + `How many finished ahead of ${c}?`,
        answer: '2',
        rationale: `${a} and ${b} were both ahead of ${c}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `${a} is older than ${b}. ${b} is older than ${c}. How many of the three are older than ${c}?`,
      answer: '2',
      rationale: `${a} and ${b} are both older than ${c}.`,
    });
  },

  // ── numerical reasoning ──────────────────────────────────────────────────
  numeric_reason(rng, d) {
    const roll = rng.int(0, 3);
    const a = rng.int(2, 12);

    if (roll === 0) {
      // Estimate, which is a different judgement from computing.
      const k = rng.int(3, 11);
      const exact = a * k;
      const rounded = Math.floor(exact / 10 + 0.5) * 10;
      return item({
        format: 'type_in',
        prompt: `Roughly what is ${a} × ${k}, to the nearest ten?`,
        answer: String(rounded),
        rationale: `It is exactly ${exact}, which rounds to ${rounded}.`,
      });
    }

    if (roll === 1) {
      // How many times over, which is division as a comparison rather than a
      // calculation. "Times as large", not "times bigger", which can be read as
      // one fewer.
      const big = a * rng.int(3, 11);
      return item({
        format: 'type_in',
        prompt: `How many times as large as ${a} is ${big}?`,
        answer: String(big / a),
        rationale: `${big} ÷ ${a} is ${big / a}.`,
      });
    }

    if (roll === 2) {
      // A percentage change, which is where numbers go wrong most often and is
      // never the same question as "what is 20% of x". The direction is in the
      // question, so the answer is a size and not a signed number, and a change
      // that lands exactly on a half is drawn again rather than left to a
      // rounding convention.
      let before = 0;
      let after = 0;
      let up = true;
      let exact = 0.5;
      while (Math.abs((exact % 1) - 0.5) < 1e-9) {
        before = rng.int(20, 200);
        up = rng.bool();
        after = up ? before + rng.int(5, 60) : before - rng.int(5, Math.max(6, before - 5));
        exact = (Math.abs(after - before) / before) * 100;
      }
      const pct = Math.round(exact);
      return item({
        format: 'type_in',
        prompt: `A value went from ${before} to ${after}. By what percent did it ${up ? 'increase' : 'decrease'}? `
          + 'Round to the nearest whole number.',
        answer: String(pct),
        // The grader forgives "$" but not "%", and "12%" is how most people write it.
        accepts: [`${pct}%`, `${pct} percent`],
        rationale: `The change is ${Math.abs(after - before)}, which is ${exact.toFixed(2)}% of ${before}, or about ${pct}%.`,
      });
    }

    let b = rng.int(2, 9);
    if (b === a) b = a === 9 ? 2 : a + 1;
    const price = rng.int(2, 9);
    return item({
      format: 'type_in',
      prompt: `A shop sells ${a} items for $${a * price} and ${b} items for $${b * price}. `
        + 'How much does one item cost?',
      answer: String(price),
      rationale: `${a * price} ÷ ${a} and ${b * price} ÷ ${b} are both ${price}, so one item costs $${price}.`,
    });
  },

  // ── codes and ciphers ────────────────────────────────────────────────────
  code_cipher(rng, d) {
    const roll = rng.int(0, 3);
    const start = rng.int(1, 12);
    const step = rng.int(1, 7);

    if (roll === 0) {
      // Undo a shift that grows letter by letter, which is applying a rule
      // rather than finding one.
      const word = rng.pick(WORDS).toUpperCase();
      const ciphered = word.split('').map((ch, i) => shift(ch, start + i * step)).join('');
      return item({
        format: 'type_in',
        prompt: `Encode a word by shifting each letter forward by ${plural(start, 'place')}, `
          + `and then ${step} more for each letter after the first, wrapping from Z back to A. `
          + `${ciphered} is the encoding of which word? Give it in capitals.`,
        answer: word,
        rationale: `Shifting the first letter back by ${start}, the next by ${start + step}, and so on gives ${word}.`,
      });
    }

    if (roll === 1) {
      // Decode a fixed shift.
      const word = rng.pick(WORDS).toUpperCase();
      const ciphered = word.split('').map((ch) => shift(ch, step)).join('');
      return item({
        format: 'type_in',
        prompt: `Each letter is replaced by the letter ${plural(step, 'place')} later in the alphabet, wrapping from Z back to A. `
          + `What word does ${ciphered} stand for? Give it in capitals.`,
        answer: word,
        rationale: `Shifting each letter back by ${step} gives ${word}.`,
      });
    }

    if (roll === 2) {
      // The inverse shift, which is arithmetic in a cipher's clothing: going
      // forward 26 − n undoes going forward n, because the alphabet wraps.
      return item({
        format: 'type_in',
        prompt: `A code shifts every letter ${plural(step, 'place')} later in the alphabet, wrapping from Z back to A. `
          + 'To decode it by shifting letters forward instead of back, how many places forward must each letter move?',
        answer: String(26 - step),
        rationale: `A shift of ${step} forward is undone by ${26 - step} more forward, since ${step} + ${26 - step} = 26 brings every letter back to itself.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: 'What comes next in this letter series? A C F J O ___',
      answer: 'U',
      rationale: 'The gaps grow by one each time: +2, +3, +4, +5, then +6, which reaches U.',
    });
  },

  // ── syllogisms ───────────────────────────────────────────────────────────
  syllogism(rng, d) {
    const roll = rng.int(0, 3);
    const [G, G2] = rng.shuffle(['archivists', 'cyclists', 'gardeners', 'violinists', 'lamplighters']);
    const one = G.replace(/s$/, '');
    const [T, T2] = rng.shuffle(['careful', 'patient', 'punctual', 'tidy']);

    if (roll === 0) {
      // Always true, which is a judgement rather than a calculation: the
      // premise read backwards. "Some careful people are archivists" also
      // follows, and "no archivists are careless" leans on a dictionary, so
      // neither is offered; only one option here must be true.
      return item({
        format: 'multiple_choice',
        prompt: `All the ${G} are ${T}. Which statement must be true?`,
        choices: rng.shuffle([
          `Anyone who is not ${T} is not ${an(one)}`,
          `All the ${T} people are ${G}`,
          `Anyone who is not ${an(one)} is not ${T}`,
          `Some ${G} are not ${T}`,
        ]),
        answer: `Anyone who is not ${T} is not ${an(one)}`,
        rationale: `If every one of the ${G} is ${T}, someone who is not ${T} cannot be one of them.`
          + ` The others reverse the premise or contradict it.`,
      });
    }

    if (roll === 1) {
      // A conclusion that does not follow, which is the harder half. The three
      // that do follow are the two premises and the first one read backwards.
      return item({
        format: 'multiple_choice',
        prompt: `All the ${G} are ${T}. Some ${T} people are ${G2}. Which conclusion does NOT follow?`,
        choices: rng.shuffle([
          `All the ${G} are ${T}`,
          `Some ${T} people are ${G2}`,
          `Anyone who is not ${T} is not ${an(one)}`,
          `All the ${G2} are ${G}`,
        ]),
        answer: `All the ${G2} are ${G}`,
        rationale: `Nothing connects being one of the ${G2} with being one of the ${G}, so that one cannot follow.`,
      });
    }

    if (roll === 2) {
      // Chain two premises, which is a different move from one.
      return item({
        format: 'multiple_choice',
        prompt: `All the ${G} are ${T}. All the ${T} people are ${T2}. What must be true of every ${one}?`,
        choices: rng.shuffle([`They are ${T2}`, 'They are careless', `They are ${G2}`, 'Nothing follows']),
        answer: `They are ${T2}`,
        rationale: `Every ${one} is ${T}, and everyone ${T} is ${T2}, so every ${one} is ${T2}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `All the ${G} are ${T}. Some ${T} people are ${G2}. Is it possible that some ${G} are ${G2}?`,
      answer: 'Yes',
      accepts: ['It is possible'],
      rationale: `It is possible without being required: the ${T} ${G2} might include some of the ${G}, and nothing rules it out.`,
    });
  },

  // ── spatial reasoning ────────────────────────────────────────────────────
  spatial_reason(rng, d) {
    const roll = rng.int(0, 3);

    if (roll === 0) {
      // Plane cuts through a solid, counted. Straight cuts with nothing moved:
      // 1 cut gives 2 pieces, 2 give 4, 3 give 8 — (k³ + 5k + 6) / 6.
      const k = rng.int(1, 3);
      const most = (k ** 3 + 5 * k + 6) / 6;
      const why = ['One flat cut through a solid separates it into two.',
        'Two cuts that cross each other make four pieces.',
        'Three cuts, one along each direction, make 2 × 2 × 2 = 8 pieces.'][k - 1];
      return item({
        format: 'type_in',
        prompt: `A block of cheese shaped like a cube is cut with ${plural(k, 'straight cut')}, and the pieces are not`
          + ' moved between cuts. What is the greatest number of pieces it can end up in?',
        answer: String(most),
        rationale: why,
      });
    }

    if (roll === 1) {
      // Counting vertices and edges, which is a different fact from the faces.
      return item({
        format: 'multiple_choice',
        prompt: 'Which set of numbers describes a cube?',
        choices: rng.shuffle(['8 vertices, 12 edges, 6 faces', '6 vertices, 12 edges, 8 faces',
          '8 vertices, 6 edges, 12 faces', '4 vertices, 8 edges, 6 faces']),
        answer: '8 vertices, 12 edges, 6 faces',
        rationale: 'Eight corners, twelve edges, and six square faces.',
      });
    }

    if (roll === 2) {
      // Following a path, which is a different skill from judging a shape.
      const room = rng.int(4, 8);
      return item({
        format: 'type_in',
        prompt: `A rectangular room is 4 metres by ${room} metres. `
          + 'Walking once around its walls, how many metres is that?',
        answer: String(2 * (4 + room)),
        rationale: `Two lengths of 4 and two of ${room}: ${8 + 2 * room}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: 'How many edges meet at each corner of a cube?',
      answer: '3',
      rationale: 'Three edges, and three square faces, meet at every corner of a cube.',
    });
  },

  // ── working memory ───────────────────────────────────────────────────────
  working_memory(rng, d) {
    const roll = rng.int(0, 3);
    const n = rng.int(3, 6);

    if (roll === 0) {
      // Recall in order, which is the same material as recall unordered and a
      // different question.
      const seq = Array.from({ length: n }, () => rng.int(10, 99));
      const sorted = seq.slice().sort((x, y) => y - x);
      return item({
        format: 'type_in',
        prompt: `Remember this order: ${seq.join(', ')}. Write it back, largest first, separated by commas.`,
        answer: sorted.join(', '),
        accepts: [sorted.join(' '), sorted.join(',')],
        rationale: `Largest first, the numbers are ${sorted.join(', ')}.`,
      });
    }

    if (roll === 1) {
      // A letter removed, which is a check on attention rather than recall. The
      // word is shown whole and then without one of its middle letters; asking
      // for the word back from a gap would have several answers ("PA_ER").
      const word = rng.pick(WORDS).toUpperCase();
      const cut = rng.int(1, word.length - 2);
      const without = word.slice(0, cut) + word.slice(cut + 1);
      return item({
        format: 'type_in',
        prompt: `Look at the word ${word}. Now look at ${without}. Which letter was removed?`,
        answer: word[cut],
        rationale: `${word} without the ${word[cut]} in position ${cut + 1} is ${without}.`,
      });
    }

    if (roll === 2) {
      // An odd one out in a remembered set, which mixes both halves of the
      // skill. The odd number is placed anywhere in the list, and drawn so that
      // it is the only number the others outvote.
      let evens = [];
      let odd = 15;
      for (let tries = 0; tries < 200 && !(evens.length && onlyOdd([...evens, odd], odd)); tries++) {
        evens = rng.shuffle([12, 14, 16, 18, 20, 22, 24, 26]).slice(0, rng.int(4, 6));
        odd = rng.pick([13, 15, 17, 19, 21, 23, 25]);
      }
      if (!onlyOdd([...evens, odd], odd)) { evens = [12, 14, 18, 22]; odd = 15; }
      const shown = rng.shuffle([...evens, odd]);
      return item({
        format: 'type_in',
        prompt: `Look at this list once: ${shown.join(', ')}. Which one was not like the others?`,
        answer: String(odd),
        rationale: `${odd} is the only odd number; every other number is even.`,
      });
    }

    const seq = Array.from({ length: n }, () => rng.int(2, 9));
    return item({
      format: 'type_in',
      prompt: `What is the total of ${seq.join(' + ')}?`,
      answer: String(seq.reduce((x, y) => x + y, 0)),
      rationale: `${seq.join(' + ')} = ${seq.reduce((x, y) => x + y, 0)}.`,
    });
  },
};

module.exports = SHAPES;
