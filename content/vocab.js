/**
 * Word banks for the item families in content/*-items.js.
 *
 * These exist so a grammar rule can be asked about hundreds of different
 * sentences instead of the same eight. Everything here is chosen to be safe in
 * any slot it is offered for — a noun listed as plural is plural in every
 * sentence that uses it, a verb listed with its forms conjugates correctly — so
 * a family cannot render an item whose answer is wrong.
 *
 * Keep the registers neutral and the subjects ordinary: school, work, home,
 * weather, travel. A grammar question is not the place for a surprise.
 */

// ── people and places ──────────────────────────────────────────────────────
const NAMES = ['Ana', 'Marcus', 'Priya', 'Devon', 'Leila', 'Tomas', 'Nadia', 'Owen',
  'Rosa', 'Kenji', 'Amara', 'Felix', 'Ingrid', 'Hassan', 'Clara', 'Mateo',
  'Yusuf', 'Bettina', 'Oscar', 'Fenella', 'Dmitri', 'Naomi', 'Caleb', 'Sunita', 'Lars', 'Beatriz', 'Omar', 'Wren', 'Josip', 'Talia', 'Gideon', 'Mei'];

const NAME_PAIRS = [['Ana', 'Iris'], ['Marcus', 'Dev'], ['Priya', 'Nora'], ['Tomas', 'Luis'],
  ['Leila', 'Maya'], ['Owen', 'Caleb'], ['Rosa', 'Elena'], ['Kenji', 'Haru']];

const ROLES_SINGULAR = ['teacher', 'engineer', 'nurse', 'driver', 'clerk', 'auditor',
  'librarian', 'coach', 'inspector', 'technician', 'manager', 'volunteer',
  'surveyor', 'welder', 'pharmacist', 'archivist', 'dispatcher', 'electrician', 'translator', 'caretaker', 'bookkeeper', 'ranger', 'paramedic', 'machinist'];

const ROLES_PLURAL = ['teachers', 'engineers', 'nurses', 'drivers', 'clerks', 'auditors',
  'librarians', 'coaches', 'inspectors', 'technicians', 'managers', 'volunteers',
  'surveyors', 'welders', 'pharmacists', 'archivists', 'dispatchers', 'electricians', 'translators', 'caretakers', 'bookkeepers', 'rangers', 'paramedics', 'machinists'];

const PLACES = ['the library', 'the warehouse', 'the clinic', 'the station', 'the workshop',
  'the greenhouse', 'the studio', 'the harbor', 'the museum', 'the depot',
  'the mill', 'the boatyard', 'the archive', 'the bakery', 'the sorting office', 'the pumping station', 'the observatory', 'the seed bank', 'the print shop', 'the dairy'];

const CITIES = ['Denver', 'Lisbon', 'Osaka', 'Nairobi', 'Halifax', 'Bogota', 'Perth',
  'Tampere', 'Quito', 'Cardiff',
  'Valparaiso', 'Bergen', 'Kandy', 'Windhoek', 'Tallinn', 'Merida', 'Dunedin', 'Gdansk', 'Fez', 'Hobart'];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MONTHS = ['January', 'March', 'April', 'June', 'August', 'October', 'November'];

// ── nouns ──────────────────────────────────────────────────────────────────
/** Countable, and unambiguously plural in a subject slot. */
const NOUNS_PLURAL = ['books', 'folders', 'pencils', 'crates', 'samples', 'invoices',
  'maps', 'ladders', 'kettles', 'benches', 'lanterns', 'timetables', 'sketches', 'buckets',
  'trowels', 'canisters', 'receipts', 'blueprints', 'sieves', 'pallets', 'clamps', 'notebooks', 'thermometers', 'hoses', 'crowbars', 'labels', 'tarpaulins', 'funnels'];

const NOUNS_SINGULAR = ['book', 'folder', 'pencil', 'crate', 'sample', 'invoice',
  'map', 'ladder', 'kettle', 'bench', 'lantern', 'timetable', 'sketch', 'bucket',
  'trowel', 'canister', 'receipt', 'blueprint', 'sieve', 'pallet', 'clamp', 'notebook', 'thermometer', 'hose', 'crowbar', 'label', 'tarpaulin', 'funnel'];

/** Uncountable, so they take "less" and a singular verb. */
const NOUNS_MASS = ['water', 'sand', 'flour', 'paperwork', 'traffic', 'evidence',
  'furniture', 'equipment', 'luggage', 'homework',
  'gravel', 'cement', 'fuel', 'timber', 'wiring', 'insulation', 'sawdust', 'fencing', 'seed', 'salt'];

const NOUNS_COLLECTIVE = ['committee', 'jury', 'team', 'board', 'crew', 'staff', 'panel', 'choir',
  'council', 'faculty', 'orchestra', 'squad', 'delegation', 'tribunal', 'congregation', 'troupe'];

/**
 * Where a thing is, as a whole phrase with its own preposition. Never put "at
 * the" or "to the" in front of one: "at the under the counter" is what that
 * produces. A template that needs a noun after its own preposition wants PLACES.
 */
const PLACES_PREP = ['on the shelf', 'in the drawer', 'under the counter', 'beside the door',
  'in the back room', 'on the top step', 'behind the desk', 'by the window',
  'above the sink', 'inside the cabinet', 'near the loading bay', 'along the far wall', 'under the stairs', 'beside the kiln', 'on the trolley', 'behind the partition'];

/** Where a person can wait, sit or work. The shelf and the drawer are not. */
const PLACES_PREP_PERSON = ['beside the door', 'in the back room', 'on the top step', 'behind the desk',
  'by the window', 'near the loading bay', 'along the far wall', 'beside the kiln', 'behind the partition',
  'under the stairs'];

/** Where something can be put down. */
const PLACES_PREP_PUT = ['on the shelf', 'in the drawer', 'under the counter', 'beside the door',
  'on the top step', 'behind the desk', 'by the window', 'inside the cabinet', 'on the trolley',
  'beside the kiln'];

/** Small things a person carries, drops, or keeps in a bag. */
const NOUNS_SMALL = ['notebook', 'pencil', 'receipt', 'map', 'folder', 'invoice', 'label', 'timetable',
  'sketch', 'blueprint', 'sample', 'thermometer'];

/** Things that are painted, so "lost its paint" is true of them. */
const NOUNS_PAINTED = ['bench', 'ladder', 'kettle', 'bucket', 'crate', 'lantern', 'canister', 'pallet'];

/** Pairs of names that take one pronoun between them, for pronoun reference. */
const NAME_PAIRS_PRONOUN = [
  { pair: ['Ana', 'Iris'], pro: 'she' }, { pair: ['Marcus', 'Dev'], pro: 'he' },
  { pair: ['Priya', 'Nora'], pro: 'she' }, { pair: ['Tomas', 'Luis'], pro: 'he' },
  { pair: ['Leila', 'Maya'], pro: 'she' }, { pair: ['Owen', 'Caleb'], pro: 'he' },
  { pair: ['Rosa', 'Elena'], pro: 'she' }, { pair: ['Kenji', 'Haru'], pro: 'he' },
];

// ── verbs ──────────────────────────────────────────────────────────────────
/**
 * Regular verbs with every form a family needs. `base` is the bare infinitive,
 * `s` the third-person singular, `past` the simple past, `ing` the participle.
 */
const VERBS = [
  { base: 'walk', s: 'walks', past: 'walked', ing: 'walking', pp: 'walked' },
  { base: 'arrive', s: 'arrives', past: 'arrived', ing: 'arriving', pp: 'arrived' },
  { base: 'finish', s: 'finishes', past: 'finished', ing: 'finishing', pp: 'finished' },
  { base: 'call', s: 'calls', past: 'called', ing: 'calling', pp: 'called' },
  { base: 'repair', s: 'repairs', past: 'repaired', ing: 'repairing', pp: 'repaired' },
  { base: 'deliver', s: 'delivers', past: 'delivered', ing: 'delivering', pp: 'delivered' },
  { base: 'practice', s: 'practices', past: 'practiced', ing: 'practicing', pp: 'practiced' },
  { base: 'report', s: 'reports', past: 'reported', ing: 'reporting', pp: 'reported' },
  { base: 'inspect', s: 'inspects', past: 'inspected', ing: 'inspecting', pp: 'inspected' },
  { base: 'answer', s: 'answers', past: 'answered', ing: 'answering', pp: 'answered' },
  { base: 'clean', s: 'cleans', past: 'cleaned', ing: 'cleaning', pp: 'cleaned' },
  { base: 'label', s: 'labels', past: 'labeled', ing: 'labeling', pp: 'labeled' },
];

/**
 * Verbs that take a direct object, for transitivity questions. Each carries the
 * object it goes with and the pronoun that stands for that object, because
 * "I packed the samples and sent it" is an agreement error of its own.
 */
const VERBS_TRANSITIVE = [
  { base: 'review', s: 'reviews', past: 'reviewed', ing: 'reviewing', pp: 'reviewed', obj: 'the contract', pro: 'it' },
  { base: 'sign', s: 'signs', past: 'signed', ing: 'signing', pp: 'signed', obj: 'the form', pro: 'it' },
  { base: 'pack', s: 'packs', past: 'packed', ing: 'packing', pp: 'packed', obj: 'the samples', pro: 'them' },
  { base: 'file', s: 'files', past: 'filed', ing: 'filing', pp: 'filed', obj: 'the report', pro: 'it' },
  { base: 'measure', s: 'measures', past: 'measured', ing: 'measuring', pp: 'measured', obj: 'the beam', pro: 'it' },
  { base: 'test', s: 'tests', past: 'tested', ing: 'testing', pp: 'tested', obj: 'the alarm', pro: 'it' },
  { base: 'draft', s: 'drafts', past: 'drafted', ing: 'drafting', pp: 'drafted', obj: 'the letter', pro: 'it' },
  { base: 'load', s: 'loads', past: 'loaded', ing: 'loading', pp: 'loaded', obj: 'the crates', pro: 'them' },
];

/**
 * Verbs that make sense with no object and over a stretch of time: "waited by
 * the window until closing", "has been working for two hours". VERBS above does
 * not — "answered at the counter" and "has been labeling for two hours" are
 * missing something.
 */
const VERBS_INTRANSITIVE = [
  { base: 'wait', s: 'waits', past: 'waited', ing: 'waiting', pp: 'waited' },
  { base: 'work', s: 'works', past: 'worked', ing: 'working', pp: 'worked' },
  { base: 'rest', s: 'rests', past: 'rested', ing: 'resting', pp: 'rested' },
  { base: 'study', s: 'studies', past: 'studied', ing: 'studying', pp: 'studied' },
  { base: 'practice', s: 'practices', past: 'practiced', ing: 'practicing', pp: 'practiced' },
  { base: 'sit', s: 'sits', past: 'sat', ing: 'sitting', pp: 'sat' },
  { base: 'stay', s: 'stays', past: 'stayed', ing: 'staying', pp: 'stayed' },
];

/** Verbs done to a physical object: a parcel, a crate, a notebook. */
const VERBS_OBJECT = [
  { base: 'deliver', s: 'delivers', past: 'delivered', ing: 'delivering', pp: 'delivered' },
  { base: 'carry', s: 'carries', past: 'carried', ing: 'carrying', pp: 'carried' },
  { base: 'collect', s: 'collects', past: 'collected', ing: 'collecting', pp: 'collected' },
  { base: 'wrap', s: 'wraps', past: 'wrapped', ing: 'wrapping', pp: 'wrapped' },
  { base: 'label', s: 'labels', past: 'labeled', ing: 'labeling', pp: 'labeled' },
  { base: 'load', s: 'loads', past: 'loaded', ing: 'loading', pp: 'loaded' },
  { base: 'inspect', s: 'inspects', past: 'inspected', ing: 'inspecting', pp: 'inspected' },
  { base: 'weigh', s: 'weighs', past: 'weighed', ing: 'weighing', pp: 'weighed' },
  { base: 'pack', s: 'packs', past: 'packed', ing: 'packing', pp: 'packed' },
];

/** Verbs that take "the same method" as an object. */
const VERBS_METHOD = [
  { base: 'use', s: 'uses', past: 'used', ing: 'using', pp: 'used' },
  { base: 'follow', s: 'follows', past: 'followed', ing: 'following', pp: 'followed' },
  { base: 'trust', s: 'trusts', past: 'trusted', ing: 'trusting', pp: 'trusted' },
  { base: 'keep', s: 'keeps', past: 'kept', ing: 'keeping', pp: 'kept' },
  { base: 'teach', s: 'teaches', past: 'taught', ing: 'teaching', pp: 'taught' },
];

// ── modifiers ──────────────────────────────────────────────────────────────
const ADJECTIVES = ['quiet', 'narrow', 'bright', 'crowded', 'damp', 'steady', 'sturdy',
  'shallow', 'empty', 'crooked', 'polished', 'chilly',
  'dusty', 'spotless', 'rusty', 'cramped', 'airy', 'brittle', 'sticky', 'uneven', 'sunlit', 'battered', 'tidy', 'heavy'];

/**
 * Adjectives that fit any object in the noun banks, from a pencil to a ladder: a
 * "crowded pencil", a "rusty receipt" or an "airy bucket" is not one of these.
 */
const ADJECTIVES_THING = ['dusty', 'damp', 'muddy', 'battered', 'spotless', 'sticky', 'faded', 'worn'];

/** Adjectives that fit a building or a room. */
const ADJECTIVES_PLACE = ['quiet', 'narrow', 'bright', 'crowded', 'damp', 'chilly', 'dusty', 'spotless',
  'cramped', 'airy', 'sunlit', 'tidy'];

const ADVERBS = ['softly', 'quickly', 'carefully', 'patiently', 'abruptly', 'neatly',
  'firmly', 'loudly', 'steadily', 'calmly',
  'briskly', 'gently', 'warily', 'evenly', 'promptly', 'clumsily', 'deliberately', 'quietly', 'roughly', 'smoothly'];

const TIME_PAST = ['Yesterday', 'Last night', 'Last winter', 'An hour ago', 'Last Tuesday',
  'Earlier today', 'Last summer',
  'Last Friday', 'Two days ago', 'Last spring', 'This morning', 'Last month'];

const TIME_PRESENT = ['Every morning', 'Each Friday', 'Most weeks', 'On weekdays',
  'Twice a month', 'Every spring',
  'Every Tuesday', 'On Sundays', 'Most evenings', 'Every other week', 'Each summer'];

const TIME_FUTURE = ['Tomorrow', 'Next week', 'Next month', 'In an hour', 'This evening',
  'Next autumn',
  'Next Monday', 'In three days', 'Later tonight', 'Next spring', 'The day after tomorrow'];

// ── things that happen, for reasoning and cause-and-effect items ───────────
const EVENTS = [
  { cause: 'the road flooded', effect: 'we turned back' },
  { cause: 'the power failed', effect: 'the meeting moved outside' },
  { cause: 'the shipment was delayed', effect: 'the launch slipped a week' },
  { cause: 'the bolts corroded', effect: 'the bridge was closed' },
  { cause: 'the well ran dry', effect: 'the crops were rationed' },
  { cause: 'the ferry was cancelled', effect: 'the team drove instead' },
  { cause: 'the alarm failed its test', effect: 'the floor was evacuated' },
  { cause: 'the printer jammed', effect: 'the forms went out late' },
  { cause: 'the kiln overheated', effect: 'the batch was scrapped' },
  { cause: 'the tide came in early', effect: 'the survey was cut short' },
  { cause: 'the supplier changed the fitting', effect: 'the pumps had to be rebuilt' },
  { cause: 'the frost held into May', effect: 'the planting slipped a month' },
  { cause: 'the bridge was resurfaced', effect: 'the buses ran the long way' },
  { cause: 'the archive flooded', effect: 'the records were moved upstairs' },
  { cause: 'the generator failed its test', effect: 'the night shift was cancelled' },
  { cause: 'the river silted up', effect: 'the barges stopped calling' },
  { cause: 'the permit expired', effect: 'the works were halted' },
  { cause: 'the roof lost two tiles', effect: 'the ceiling stained' },
  { cause: 'the ferry timetable changed', effect: 'half the crew arrived late' },
  { cause: 'the well water turned brackish', effect: 'the herd was moved inland' },
];

/** Pairs where the first is an advantage and the second a drawback, for
 *  contrast transitions and concession. */
const TRADEOFFS = [
  { good: 'The alloy resists corrosion', bad: 'it costs four times as much as steel' },
  { good: 'The route is shorter', bad: 'it closes in winter' },
  { good: 'The method is accurate', bad: 'it takes three days' },
  { good: 'The software is free', bad: 'nobody supports it' },
  { good: 'The hall seats six hundred', bad: 'it has no parking' },
  { good: 'The pump is quiet', bad: 'it moves half the water' },
  { good: 'The lease is cheap', bad: 'it runs for ten years' },
  { good: 'The sensor is tiny', bad: 'it drifts in the heat' },
  { good: 'The kiln fires evenly', bad: 'it takes two days to cool' },
  { good: 'The ferry runs hourly', bad: 'it carries no vehicles' },
  { good: 'The archive is complete', bad: 'none of it is indexed' },
  { good: 'The alloy is light', bad: 'it cannot be welded' },
  { good: 'The site is central', bad: 'it floods every few winters' },
  { good: 'The press is fast', bad: 'it wastes a third of the paper' },
  { good: 'The route avoids the hills', bad: 'it adds forty kilometres' },
  { good: 'The design needs no power', bad: 'it only works downhill' },
  { good: 'The survey is thorough', bad: 'it is already ten years old' },
  { good: 'The bricks are local', bad: 'they vary in size' },
  { good: 'The glaze is food safe', bad: 'it chips at the rim' },
];

module.exports = {
  NAMES,
  NAME_PAIRS,
  ROLES_SINGULAR,
  ROLES_PLURAL,
  PLACES,
  CITIES,
  DAYS,
  MONTHS,
  NOUNS_PLURAL,
  NOUNS_SINGULAR,
  NOUNS_MASS,
  NOUNS_COLLECTIVE,
  PLACES_PREP,
  PLACES_PREP_PERSON,
  PLACES_PREP_PUT,
  NOUNS_SMALL,
  NOUNS_PAINTED,
  NAME_PAIRS_PRONOUN,
  VERBS,
  VERBS_TRANSITIVE,
  VERBS_INTRANSITIVE,
  VERBS_OBJECT,
  VERBS_METHOD,
  ADJECTIVES,
  ADJECTIVES_THING,
  ADJECTIVES_PLACE,
  ADVERBS,
  TIME_PAST,
  TIME_PRESENT,
  TIME_FUTURE,
  EVENTS,
  TRADEOFFS,
};
