/**
 * Structured representation of the Markdown archive.
 *
 * These records are hand-derived from content/ rather than parsed out of it.
 * The archive is years of idiosyncratic notes — inconsistent headings, spice
 * lists that are sometimes calculations and sometimes what was actually
 * used, tables with different columns per batch. A parser over that produces
 * confident nonsense; a careful transcription produces a correct starting
 * point. The archive stays the provenance record, and any disagreement is
 * settled by re-reading it.
 *
 * The biltong entry is deliberately modelled as six revisions of one recipe
 * rather than six recipes, because that is what it is: one dish being
 * refined across five cooked batches and a plan for a sixth.
 */
import type {
  CreateRecipeArgs,
  LogExperimentArgs,
  UpsertIngredientArgs,
} from '@/lib/domain/schemas';

export interface RevisionSeed {
  rationale: string;
  ingredients?: CreateRecipeArgs['ingredients'];
  steps?: CreateRecipeArgs['steps'];
  summary?: string;
  yieldQuantity?: number;
  yieldUnit?: string;
  notes?: CreateRecipeArgs['notes'];
}

export interface RecipeSeed {
  recipe: CreateRecipeArgs;
  revisions?: RevisionSeed[];
}

// ─────────────────────────────────────────────────────────────────────────
// Ingredients
// ─────────────────────────────────────────────────────────────────────────

export const INGREDIENTS: UpsertIngredientArgs[] = [
  {
    name: 'Beef silverside',
    category: 'protein',
    aliases: ['silverside', 'topside', 'bottom round'],
    defaultUnit: 'kg',
    description:
      'The cut every batch here has used. Lean, uniform grain, and it holds a ' +
      'long strip together while it dries.',
  },
  { name: 'Salt', category: 'additive', defaultUnit: 'g', densityGPerMl: 1.2 },
  {
    name: 'Black pepper',
    category: 'spice',
    aliases: ['peppercorns', 'black peppercorns'],
    defaultUnit: 'g',
  },
  {
    name: 'Coriander seed',
    category: 'spice',
    aliases: ['coriander', 'coriander seeds', 'cilantro seed'],
    defaultUnit: 'g',
    description:
      'Ground coarsely and separately from everything else — the large pieces ' +
      'are the point, and a fine grind vanishes into the dredge.',
  },
  {
    name: 'Star anise',
    category: 'spice',
    aliases: ['star anise pods'],
    defaultUnit: 'pod',
  },
  { name: 'Garam masala', category: 'spice', defaultUnit: 'g' },
  { name: 'Tandoori masala', category: 'spice', defaultUnit: 'g' },
  {
    name: 'Cayenne pepper',
    category: 'spice',
    aliases: ['cayenne', 'cayenne pepper powder'],
    defaultUnit: 'g',
    substitutes: ["Piment d'Espelette"],
  },
  {
    name: "Piment d'Espelette",
    category: 'spice',
    aliases: ['espelette pepper', 'espelette'],
    defaultUnit: 'g',
    description:
      'French AOP chilli powder. Milder and fruitier than cayenne, so it was ' +
      'used at a much higher rate in batch 5.',
  },
  {
    name: 'Chipotle chilli',
    category: 'spice',
    aliases: ['chipotle'],
    defaultUnit: 'piece',
  },
  {
    name: 'Guajillo chilli',
    category: 'spice',
    aliases: ['guajillo'],
    defaultUnit: 'piece',
  },
  {
    name: 'Ancho chilli',
    category: 'spice',
    aliases: ['ancho'],
    defaultUnit: 'piece',
  },
  {
    name: 'Árbol chilli',
    category: 'spice',
    aliases: ['arbol', 'chile de arbol'],
    defaultUnit: 'piece',
  },
  {
    name: 'Worcestershire sauce',
    category: 'condiment',
    defaultUnit: 'g',
    densityGPerMl: 1.1,
    description:
      'Roughly 10% vinegar, which is why it counts toward the wash acidity.',
  },
  {
    name: 'Red wine vinegar',
    category: 'acid',
    defaultUnit: 'g',
    densityGPerMl: 1.01,
  },
  {
    name: 'Apple cider vinegar',
    category: 'acid',
    aliases: ['apple cider', 'cider vinegar'],
    defaultUnit: 'g',
    densityGPerMl: 1.01,
  },
  {
    name: 'Condimento blanco',
    category: 'acid',
    aliases: ['white condiment vinegar'],
    defaultUnit: 'g',
    densityGPerMl: 1.01,
  },
  {
    name: 'Black malt vinegar',
    category: 'acid',
    aliases: ['black vinegar', 'chinkiang vinegar'],
    defaultUnit: 'g',
    densityGPerMl: 1.03,
  },

  {
    name: 'Jalapeño',
    category: 'produce',
    aliases: ['jalapeno', 'jalapenos', 'jalapeños'],
    defaultUnit: 'g',
  },
  {
    name: 'Garlic',
    category: 'produce',
    aliases: ['garlic cloves'],
    defaultUnit: 'clove',
  },
  {
    name: 'White distilled vinegar',
    category: 'acid',
    aliases: ['white vinegar', 'distilled vinegar'],
    defaultUnit: 'cup',
    densityGPerMl: 1.01,
  },
  { name: 'Water', category: 'liquid', defaultUnit: 'cup', densityGPerMl: 1 },
  {
    name: 'Sugar',
    category: 'sweetener',
    aliases: ['white sugar', 'granulated sugar'],
    defaultUnit: 'tbsp',
    densityGPerMl: 0.85,
  },
  {
    name: 'Sea salt',
    category: 'additive',
    defaultUnit: 'tbsp',
    substitutes: ['Salt'],
  },
  {
    name: 'Bay leaf',
    category: 'herb',
    aliases: ['bay leaves'],
    defaultUnit: 'leaf',
  },

  {
    name: 'Crayfish',
    category: 'protein',
    aliases: ['crawfish', 'Louisiana crayfish', 'Berlin lobster'],
    defaultUnit: 'kg',
  },
  {
    name: 'Red potatoes',
    category: 'produce',
    aliases: ['new potatoes', 'small red potatoes'],
    defaultUnit: 'kg',
  },
  {
    name: 'Corn',
    category: 'produce',
    aliases: ['sweetcorn', 'corn on the cob'],
    defaultUnit: 'ear',
  },
  {
    name: 'Smoked sausage',
    category: 'protein',
    aliases: ['kielbasa'],
    defaultUnit: 'kg',
  },
  {
    name: 'Onion',
    category: 'produce',
    aliases: ['onions'],
    defaultUnit: 'kg',
  },
  {
    name: 'Lemon',
    category: 'produce',
    aliases: ['lemons'],
    defaultUnit: 'piece',
  },
  { name: 'Butter', category: 'fat', defaultUnit: 'g', densityGPerMl: 0.91 },
  {
    name: 'Old Bay seasoning',
    category: 'spice',
    aliases: ['old bay'],
    defaultUnit: 'g',
  },
  {
    name: 'Dark beer',
    category: 'alcohol',
    aliases: ['German dark beer', 'dunkel'],
    defaultUnit: 'bottle',
  },

  { name: 'Beef marrow bones', category: 'protein', defaultUnit: 'lb' },
  { name: 'Veal knuckles', category: 'protein', defaultUnit: 'lb' },
  { name: 'Oxtail', category: 'protein', defaultUnit: 'lb' },
  { name: 'Tomato paste', category: 'condiment', defaultUnit: 'oz' },
  {
    name: 'Mirepoix',
    category: 'produce',
    defaultUnit: 'cup',
    description:
      'Onion, carrot and celery at 72:18:10 in the demi-glace method.',
  },
  {
    name: 'Wondra flour',
    category: 'grain',
    aliases: ['instant flour'],
    defaultUnit: 'g',
  },
  { name: 'Kombu', category: 'other', aliases: ['kelp'], defaultUnit: 'piece' },
];

// ─────────────────────────────────────────────────────────────────────────
// Biltong — one recipe, six revisions
// ─────────────────────────────────────────────────────────────────────────

/** Wash and dredge as a flat ingredient list for a given batch. */
function biltongLines(spec: {
  meatKg: number;
  wash: Partial<Record<string, number>>;
  salt: number;
  pepper: number;
  coriander: number;
  starAnise: number;
  garam?: number;
  tandoori?: number;
  indianMasala?: number;
  cayenne?: number;
  espelette?: number;
  chillies?: { name: string; count: number; countMax?: number }[];
}): NonNullable<CreateRecipeArgs['ingredients']> {
  const lines: NonNullable<CreateRecipeArgs['ingredients']> = [
    {
      name: 'Beef silverside',
      quantity: spec.meatKg,
      unit: 'kg',
      preparation: 'cut into strips along the grain',
    },
  ];

  const washOrder: [string, string][] = [
    ['worcestershire', 'Worcestershire sauce'],
    ['redWine', 'Red wine vinegar'],
    ['appleCider', 'Apple cider vinegar'],
    ['condimento', 'Condimento blanco'],
    ['blackMalt', 'Black malt vinegar'],
  ];
  for (const [key, name] of washOrder) {
    const amount = spec.wash[key];
    if (amount != null) {
      lines.push({ name, quantity: amount, unit: 'g', component: 'Wash' });
    }
  }

  lines.push(
    { name: 'Salt', quantity: spec.salt, unit: 'g', component: 'Dredge' },
    {
      name: 'Black pepper',
      quantity: spec.pepper,
      unit: 'g',
      component: 'Dredge',
    },
    {
      name: 'Coriander seed',
      quantity: spec.coriander,
      unit: 'g',
      component: 'Dredge',
      preparation: 'ground coarsely, separately',
    },
    {
      name: 'Star anise',
      quantity: spec.starAnise,
      unit: 'pod',
      component: 'Dredge',
    },
  );

  if (spec.tandoori)
    lines.push({
      name: 'Tandoori masala',
      quantity: spec.tandoori,
      unit: 'g',
      component: 'Dredge',
    });
  if (spec.garam)
    lines.push({
      name: 'Garam masala',
      quantity: spec.garam,
      unit: 'g',
      component: 'Dredge',
    });
  if (spec.cayenne)
    lines.push({
      name: 'Cayenne pepper',
      quantity: spec.cayenne,
      unit: 'g',
      component: 'Dredge',
    });
  if (spec.espelette)
    lines.push({
      name: "Piment d'Espelette",
      quantity: spec.espelette,
      unit: 'g',
      component: 'Dredge',
    });
  for (const chilli of spec.chillies ?? []) {
    lines.push({
      name: chilli.name,
      quantity: chilli.count,
      quantityMax: chilli.countMax ?? null,
      unit: 'piece',
      component: 'Dredge',
      preparation: 'deseeded',
    });
  }
  return lines;
}

const BILTONG_STEPS: NonNullable<CreateRecipeArgs['steps']> = [
  {
    phase: 'Prep',
    instruction:
      'Weigh the whole silverside, then cut it into strips along the grain. Weigh each strip and record it — this is the number every later drying calculation is measured against.',
    technique: 'butchery',
    uses: ['Beef silverside'],
  },
  {
    phase: 'Prep',
    instruction:
      'Grind the coriander on its own, coarsely. Grind the remaining whole spices separately and combine into the dredge.',
    technique: 'grinding',
    uses: ['Coriander seed', 'Black pepper', 'Star anise'],
    note: 'Coriander is the one that matters here: you want visible pieces in the finished biltong.',
  },
  {
    phase: 'Cure',
    instruction:
      'Combine the wash ingredients. Work fast and keep the meat cold — as it warms, fat and myoglobin bleed into the wash and it stops being usable.',
    uses: [
      'Worcestershire sauce',
      'Red wine vinegar',
      'Apple cider vinegar',
      'Condimento blanco',
      'Black malt vinegar',
    ],
  },
  {
    phase: 'Cure',
    instruction:
      'Wash each strip thoroughly, then dredge it in the spice mix until fully coated.',
    technique: 'dry-curing',
    uses: ['Salt'],
    note: 'Make more dredge than you think you need. Running out part-way through leaves the last pieces bare.',
  },
  {
    phase: 'Cure',
    instruction:
      'Rest the spiced strips in the fridge for one to two nights. This is functionally a dry brine — weigh the pieces before they go in.',
    durationMinutes: 1440,
    durationMaxMinutes: 2880,
    technique: 'dry-brining',
  },
  {
    phase: 'Hang',
    instruction:
      'Hook each piece and hang it with air moving freely around it. Record the hook weight so net weights stay honest.',
    equipment: ['7 cm steel hooks (13 g)', 'drying box'],
  },
  {
    phase: 'Hang',
    instruction:
      'Dry until the piece has lost roughly 55% of its net weight. Expect about 13–15 days for a medium piece; weight loss averages 4.21% of initial weight per day, and small pieces go much faster.',
    durationMinutes: 18720,
    durationMaxMinutes: 21600,
    technique: 'air-drying',
  },
];

const BILTONG: RecipeSeed = {
  recipe: {
    slug: 'baumy-biltong',
    title: 'Baumy Biltong',
    subtitle: 'Six batches of working out a wash and a dredge',
    summary:
      'Air-dried cured beef, refined across five cooked batches and a planned sixth. ' +
      'The wash is a vinegar blend; the dredge is salt, coarse coriander and a masala base. ' +
      'Every revision below is a real batch and says what it changed.',
    kind: 'recipe',
    originNote:
      'Started as a South African staple made from Irish silverside in Berlin, which is ' +
      'most of the reason the spice profile drifted toward tandoori masala.',
    categories: {
      cuisine: ['South African'],
      technique: ['dry-curing', 'air-drying'],
      preservation: ['curing', 'air-drying'],
      course: ['snack'],
      equipment: ['drying box', 'spice grinder'],
      texture: ['chewy'],
    },
    rationale:
      'Baseline batch. 1.7 kg, no wash at all — just salt, pepper, coriander and star anise ' +
      'straight onto the meat, in two measures because the first was clearly not enough.',
    yieldQuantity: 0.77,
    yieldUnit: 'kg dried',
    ingredients: biltongLines({
      meatKg: 1.7,
      wash: {},
      salt: 27,
      pepper: 3,
      coriander: 6,
      starAnise: 4,
    }),
    steps: BILTONG_STEPS.filter(
      (step) => !step.uses?.includes('Worcestershire sauce'),
    ),
    notes: [
      {
        kind: 'observation',
        title: 'Equipment',
        body: '30 × 7 cm steel hooks, 13 g each — €29.97. The 13 g is subtracted from every gross weight to get net.',
      },
    ],
  },
  revisions: [
    {
      rationale:
        'Scaled to 5.98 kg and introduced a wash for the first time — 141 g of mixed vinegars ' +
        'and Worcestershire. Salt cut 20% from batch 1, which was too salty at 15.88 g/kg. ' +
        'Forgot the garam masala entirely and had to add it just before hanging.',
      yieldQuantity: 2.6,
      yieldUnit: 'kg dried',
      ingredients: biltongLines({
        meatKg: 5.98,
        wash: {
          worcestershire: 60,
          redWine: 21,
          appleCider: 17,
          condimento: 20,
          blackMalt: 16,
        },
        salt: 75.8,
        pepper: 10.5,
        coriander: 21.1,
        starAnise: 7,
        chillies: [
          { name: 'Árbol chilli', count: 1 },
          { name: 'Guajillo chilli', count: 2 },
        ],
      }),
      steps: BILTONG_STEPS,
      notes: [
        {
          kind: 'result',
          title: 'Need 20% more wash',
          body: '141 g of wash did not comfortably cover 5.98 kg. Worcestershire is about 10% vinegar, so it counts toward the acidity budget rather than sitting outside it.',
        },
        {
          kind: 'correction',
          title: 'Garam masala forgotten',
          body: 'It went on immediately before hanging rather than into the dredge. Put it in the spice mix from the start next time.',
        },
      ],
    },
    {
      rationale:
        'Added the masala base that defines the profile from here on: 54 g tandoori masala ' +
        '(about a third of total spice weight) plus 3 g garam masala. Coriander raised sharply ' +
        'from 3.53 to 5.92 g/kg. Salt settled at 10% below the batch 1 rate. The wash was left ' +
        'unchanged despite the batch 2 note saying to increase it.',
      ingredients: biltongLines({
        meatKg: 6.02,
        wash: {
          worcestershire: 75,
          redWine: 21,
          appleCider: 17,
          condimento: 20,
          blackMalt: 16,
        },
        salt: 83.38,
        pepper: 10.5,
        coriander: 35.66,
        starAnise: 7,
        garam: 3,
        tandoori: 54,
        chillies: [
          { name: 'Chipotle chilli', count: 4 },
          { name: 'Guajillo chilli', count: 2 },
        ],
      }),
      steps: BILTONG_STEPS,
      notes: [
        {
          kind: 'warning',
          title: 'The wash increase did not happen',
          body: 'Batch 2 said to add 20% more wash. Batch 3 used the same 149 g for a slightly larger batch, so the note carried forward unresolved.',
        },
      ],
    },
    {
      rationale:
        'Wash finally scaled properly with the meat (~197 g for 7.98 kg). Heat added deliberately ' +
        'for the first time: 10 g cayenne plus ancho, chipotle and guajillo. Tandoori doubled to ' +
        '107.4 g. The dredge still ran out — 1.6 kg of meat went uncovered.',
      ingredients: biltongLines({
        meatKg: 7.98,
        wash: {
          worcestershire: 99.4,
          redWine: 27.8,
          appleCider: 22.5,
          condimento: 26.5,
          blackMalt: 21.2,
        },
        salt: 110.5,
        pepper: 13.9,
        coriander: 47.3,
        starAnise: 10,
        tandoori: 107.4,
        cayenne: 10,
        chillies: [
          { name: 'Chipotle chilli', count: 2 },
          { name: 'Guajillo chilli', count: 2 },
          { name: 'Ancho chilli', count: 12 },
        ],
      }),
      steps: BILTONG_STEPS,
      notes: [
        {
          kind: 'result',
          title: '1.6 kg went undredged',
          body: 'The spice mix ran out before the meat did. Volume, not weight, is the binding constraint on coverage — better to have leftover dredge than bare meat.',
        },
      ],
    },
    {
      rationale:
        'Ran short on Worcestershire, tandoori masala and cayenne, so this batch is a set of ' +
        'substitutions rather than a clean iteration: 70 g Worcestershire instead of 99.4 g, ' +
        '50 g tandoori topped up with 54 g garam and 50 g Indian masala, and 80 g piment ' +
        "d'Espelette standing in for cayenne. The two learnings worth keeping are +30% wash " +
        'and +40% seasoning volume.',
      yieldQuantity: 3.697,
      yieldUnit: 'kg dried',
      ingredients: biltongLines({
        meatKg: 8.2,
        wash: {
          worcestershire: 70,
          redWine: 27.8,
          appleCider: 22.5,
          condimento: 26.5,
          blackMalt: 21.2,
        },
        salt: 110.5,
        pepper: 13.9,
        coriander: 47.3,
        starAnise: 10,
        garam: 54,
        tandoori: 50,
        espelette: 80,
        chillies: [
          { name: 'Chipotle chilli', count: 5 },
          { name: 'Guajillo chilli', count: 3 },
        ],
      }),
      steps: BILTONG_STEPS,
      notes: [
        {
          kind: 'result',
          title: 'Increase the wash by 30%',
          body: 'Coverage was marginal again. Temperature matters as much as volume: once the meat warms, fat and myoglobin mix into the wash and it stops working.',
        },
        {
          kind: 'result',
          title: 'Increase seasoning volume by 40%',
          body: 'A finer grind covers less surface area for the same weight. The dredge needs to be specified by coverage, not only by ratio.',
        },
        {
          kind: 'observation',
          title: 'Weigh before the fridge rest',
          body: 'The meat sits spiced for two nights, which is a dry brine and loses weight. Weighing after that rest understates the drying loss that follows.',
        },
        {
          kind: 'substitution',
          title: "Piment d'Espelette for cayenne",
          body: '80 g of Espelette replaced 15 g of cayenne. It is far milder, which is why the quantity is five times higher — not a like-for-like swap.',
        },
      ],
    },
    {
      rationale:
        'Planned 10 kg batch, not yet cooked. Built from batch 4 per-kilogram ratios (the most ' +
        'complete batch without substitution problems), scaled to 10 kg, then batch 5 learnings ' +
        'applied: +30% on the wash and +40% on seasoning volume. Salt deliberately held flat at ' +
        '13.85 g/kg rather than raised 40% — salt dissolves, so it does not need a volume bump ' +
        'for coverage, and over-salting is the one error here that cannot be corrected.',
      summary:
        'The current specification: a 10 kg batch with 321.7 g of wash and a dredge sized for ' +
        'coverage rather than by ratio alone.',
      yieldQuantity: 4.5,
      yieldUnit: 'kg dried',
      ingredients: biltongLines({
        meatKg: 10,
        wash: {
          worcestershire: 162,
          redWine: 45.2,
          appleCider: 36.7,
          condimento: 43.2,
          blackMalt: 34.6,
        },
        salt: 138.5,
        pepper: 24.4,
        coriander: 83,
        starAnise: 17,
        tandoori: 188.4,
        garam: 8,
        cayenne: 17.5,
        chillies: [
          { name: 'Chipotle chilli', count: 4, countMax: 5 },
          { name: 'Guajillo chilli', count: 4, countMax: 5 },
          { name: 'Ancho chilli', count: 20 },
        ],
      }),
      steps: BILTONG_STEPS,
      notes: [
        {
          kind: 'idea',
          title: 'Salt: conservative or full +40%',
          body: 'The alternative reading of the batch 5 note gives 193.9 g of salt. Batches 4 and 5 both tasted right at ~13.5–13.85 g/kg, so this revision takes the conservative figure. If the finished batch reads under-seasoned rather than under-covered, that is the number to revisit.',
        },
        {
          kind: 'observation',
          title: 'Expected yield',
          body: 'About 45% of net weight, so roughly 4.5 kg finished from 10 kg raw, across an estimated 25–30 pieces.',
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// The rest
// ─────────────────────────────────────────────────────────────────────────

const PICKLED_JALAPENOS: RecipeSeed = {
  recipe: {
    slug: 'pickled-jalapenos',
    title: 'Pickled Jalapeños',
    summary:
      'A refrigerator pickle in a 1:1 vinegar and water brine. Ready in a day, keeps two months.',
    kind: 'recipe',
    categories: {
      cuisine: ['Mexican'],
      technique: ['pickling'],
      preservation: ['pickling'],
      course: ['condiment'],
      diet: ['vegan', 'gluten-free'],
      texture: ['crisp'],
    },
    rationale: 'Transcribed from the archive as originally written.',
    yieldQuantity: 500,
    yieldUnit: 'g',
    totalTimeMinutes: 1470,
    activeTimeMinutes: 30,
    ingredients: [
      {
        name: 'Jalapeño',
        quantity: 500,
        unit: 'g',
        preparation: 'sliced into 1/4 inch rings, stems discarded',
      },
      {
        name: 'Garlic',
        quantity: 2,
        unit: 'clove',
        preparation: 'peeled and lightly crushed',
      },
      {
        name: 'White distilled vinegar',
        quantity: 2,
        unit: 'cup',
        component: 'Brine',
      },
      { name: 'Water', quantity: 2, unit: 'cup', component: 'Brine' },
      { name: 'Sugar', quantity: 2, unit: 'tbsp', component: 'Brine' },
      { name: 'Sea salt', quantity: 1, unit: 'tbsp', component: 'Brine' },
      {
        name: 'Black pepper',
        quantity: 1,
        unit: 'tsp',
        component: 'Brine',
        preparation: 'whole peppercorns',
      },
      { name: 'Bay leaf', quantity: 1, unit: 'leaf', component: 'Brine' },
    ],
    steps: [
      {
        instruction:
          'Wash the jalapeños and slice into rings about 1/4 inch thick, discarding the stems.',
        uses: ['Jalapeño'],
        note: 'Remove the seeds first for a milder pickle.',
      },
      {
        instruction:
          'Combine the vinegar, water, sugar, salt, peppercorns and bay leaf in a saucepan and bring to a boil, stirring until the sugar and salt dissolve.',
        uses: [
          'White distilled vinegar',
          'Water',
          'Sugar',
          'Sea salt',
          'Black pepper',
          'Bay leaf',
        ],
        technique: 'boiling',
      },
      {
        instruction: 'Reduce the heat and simmer for 5 minutes.',
        durationMinutes: 5,
        technique: 'simmering',
      },
      {
        instruction:
          'Pack the sliced jalapeños and garlic into clean glass jars.',
        uses: ['Jalapeño', 'Garlic'],
      },
      {
        instruction:
          'Pour the hot brine over the jalapeños, making sure they are completely covered.',
      },
      { instruction: 'Let the jars cool to room temperature.' },
      {
        instruction:
          'Seal and refrigerate at least 24 hours before eating so the flavours develop.',
        durationMinutes: 1440,
      },
    ],
    notes: [
      {
        kind: 'observation',
        title: 'Storage',
        body: 'Keeps in the refrigerator for up to 2 months.',
      },
      {
        kind: 'idea',
        title: 'Variations worth trying',
        body: [
          'Untested ideas carried over from the original note:',
          '',
          '- 2½ tsp sesame oil in the brine',
          '- Cauliflower florets and green beans for colour and variety',
          '- Jicama sticks for crunch',
          '- White wine in place of the water',
          '- Cumin and chilli powder in the brine',
          '- Coconut sugar instead of white sugar',
          '',
          'Scale the brine up if you add vegetables — everything has to stay submerged.',
        ].join('\n'),
      },
      {
        kind: 'substitution',
        title: 'Sugar as a heat dial',
        body: 'More sugar gives a milder pickle, less keeps it spicier.',
      },
    ],
  },
};

const BERLIN_BOIL: RecipeSeed = {
  recipe: {
    slug: 'berlin-crayfish-boil',
    title: 'Berlin Boil',
    subtitle:
      'Louisiana-style crayfish boil for fifty, using Berlin’s invasive crayfish',
    summary:
      'A crayfish boil scaled for 50 people, built around the Louisiana crayfish that have ' +
      'become invasive in Berlin’s waterways. Includes where to actually get them.',
    kind: 'recipe',
    originNote:
      'Berlin has a genuine invasive Louisiana crayfish population, and harvesting them is ' +
      'encouraged. Availability is erratic — call ahead.',
    categories: {
      cuisine: ['Cajun', 'German'],
      technique: ['boiling'],
      course: ['main'],
      occasion: ['party'],
      season: ['summer'],
      equipment: ['propane burner', 'stockpot'],
    },
    rationale: 'Transcribed from the archive as originally written.',
    servings: 50,
    ingredients: [
      {
        name: 'Crayfish',
        quantity: 50,
        quantityMax: 60,
        unit: 'kg',
        preparation: 'live',
        note: 'Roughly 1–1.2 kg per person.',
      },
      { name: 'Red potatoes', quantity: 10, unit: 'kg', preparation: 'halved' },
      {
        name: 'Corn',
        quantity: 20,
        unit: 'ear',
        preparation: 'cut into thirds',
      },
      {
        name: 'Smoked sausage',
        quantity: 5,
        unit: 'kg',
        preparation: 'cut into 5 cm pieces',
      },
      { name: 'Onion', quantity: 5, unit: 'kg', preparation: 'quartered' },
      {
        name: 'Garlic',
        quantity: 10,
        unit: 'head',
        preparation: 'halved crosswise',
      },
      { name: 'Lemon', quantity: 10, unit: 'piece', preparation: 'halved' },
      {
        name: 'Butter',
        quantity: 500,
        unit: 'g',
        preparation: 'melted, for serving',
      },
      { name: 'Salt', quantity: 500, unit: 'g', component: 'Boil' },
      {
        name: 'Old Bay seasoning',
        quantity: 250,
        unit: 'g',
        component: 'Boil',
      },
      { name: 'Cayenne pepper', quantity: 100, unit: 'g', component: 'Boil' },
      { name: 'Bay leaf', quantity: 10, unit: 'leaf', component: 'Boil' },
      {
        name: 'Dark beer',
        quantity: 5,
        unit: 'bottle',
        component: 'Boil',
        note: '330 ml each.',
      },
    ],
    steps: [
      {
        instruction:
          'Fill each pot two-thirds with water. Divide the salt, Old Bay, cayenne, bay leaves and beer proportionally between them and bring to a boil.',
        equipment: ['4–5 pots of 60–80 L', '4–5 propane burners'],
        uses: [
          'Salt',
          'Old Bay seasoning',
          'Cayenne pepper',
          'Bay leaf',
          'Dark beer',
        ],
        technique: 'boiling',
      },
      {
        instruction: 'Add the potatoes and cook for 10 minutes.',
        durationMinutes: 10,
        uses: ['Red potatoes'],
      },
      {
        instruction:
          'Add the corn, sausage, onions, garlic and lemons. Cook 5 minutes more.',
        durationMinutes: 5,
        uses: ['Corn', 'Smoked sausage', 'Onion', 'Garlic', 'Lemon'],
      },
      {
        instruction: 'Add the crayfish and cook 3–5 minutes, until bright red.',
        durationMinutes: 3,
        durationMaxMinutes: 5,
        uses: ['Crayfish'],
      },
      {
        instruction:
          'Off the heat, let everything soak 15–20 minutes to take on the seasoning.',
        durationMinutes: 15,
        durationMaxMinutes: 20,
      },
      {
        instruction:
          'Drain and tip out onto newspaper-covered tables with melted butter for dipping.',
        uses: ['Butter'],
      },
    ],
    notes: [
      {
        kind: 'research',
        title: 'Where to buy crayfish in Berlin',
        body: [
          '**Restaurants and markets**',
          '',
          '- **Fisch Frank**, Spandau — Louisiana crawfish caught from Berlin waterways, served as a starter. Owner Olaf Pelz.',
          '- **Markthalle IX**, Kreuzberg — occasional Louisiana-style boils; the 25 Teiche stand sells crayfish by the kilo (~€29/kg).',
          '- **Frische Paradies**, Moritzplatz — fresh and frozen, availability varies.',
          '- **Rogacki**, Wilmersdorfer Straße — historic deli, seasonal crayfish.',
          '',
          '**Wholesalers**',
          '',
          '- Pescaderia en Berlin, Seafood Transfer, Deutsche See — all supply restaurants and may source for larger orders.',
          '',
          '**Direct**',
          '',
          '- **Klaus Hidde** — licensed fisherman catching the invasive population; seasonal stand at Zitadelle Spandau during summer concerts.',
          '- **Berliner Anglerverband e.V.** — can point toward local fishermen and spots.',
          '',
          'Availability is inconsistent because it depends on catching an invasive species. Call ahead.',
        ].join('\n'),
      },
      {
        kind: 'observation',
        title: 'Season',
        body: 'Crayfish are most abundant in Berlin waters from late spring through early autumn.',
      },
      {
        kind: 'warning',
        title: 'Harvest responsibly',
        body: 'Removal of the invasive population is encouraged, but buy from licensed sources or fish with a permit — the rules still apply.',
      },
      {
        kind: 'idea',
        title: 'Local adjustments',
        body: 'Berlin palates may want less heat than a Southern boil. Pretzels or sauerkraut alongside work better than they have any right to.',
      },
    ],
  },
};

const DEMI_GLACE: RecipeSeed = {
  recipe: {
    slug: 'demi-glace',
    title: 'Demi-Glace',
    subtitle: 'A 48–72 hour reduction, done properly',
    summary:
      'Classical demi-glace with a dual-bone foundation, triple clarification and a staged ' +
      'reduction. A preparation other recipes pull in rather than a dish.',
    kind: 'preparation',
    categories: {
      cuisine: ['French'],
      technique: ['roasting', 'reduction', 'clarification'],
      course: ['sauce'],
      equipment: ['China cap', 'fine-mesh sieve'],
      texture: ['silky'],
    },
    rationale:
      'Transcribed from the archive research note into an executable preparation.',
    totalTimeMinutes: 4320,
    ingredients: [
      {
        name: 'Beef marrow bones',
        quantity: 3,
        unit: 'lb',
        component: 'Stock',
        note: 'Rendered marrow gives the buttery mouthfeel.',
      },
      {
        name: 'Veal knuckles',
        quantity: 2,
        unit: 'lb',
        component: 'Stock',
        note: 'High gelatin; the cartilage needs 8+ hours to break down.',
      },
      {
        name: 'Oxtail',
        quantity: 1,
        unit: 'lb',
        component: 'Stock',
        preparation: 'roasted',
      },
      { name: 'Tomato paste', quantity: 6, unit: 'oz', component: 'Stock' },
      { name: 'Red wine vinegar', quantity: 2, unit: 'oz', component: 'Stock' },
      {
        name: 'Butter',
        quantity: 1,
        unit: 'lb',
        component: 'Espagnole',
        preparation: 'clarified',
      },
      {
        name: 'Wondra flour',
        quantity: 180,
        unit: 'g',
        component: 'Espagnole',
      },
      {
        name: 'Mirepoix',
        quantity: 2,
        unit: 'cup',
        component: 'Espagnole',
        preparation: 'caramelised separately in duck fat',
      },
      {
        name: 'Kombu',
        quantity: 1,
        unit: 'piece',
        component: 'Finishing',
        preparation: 'rinsed, 4 inch',
        optional: true,
      },
    ],
    steps: [
      {
        phase: 'Roast',
        instruction:
          'Arrange the bones in a single layer on rack-lined sheet pans and roast at 232 °C for 45 minutes to develop the Maillard crust.',
        temperatureC: 232,
        durationMinutes: 45,
        technique: 'roasting',
        uses: ['Beef marrow bones', 'Veal knuckles', 'Oxtail'],
      },
      {
        phase: 'Roast',
        instruction:
          'Brush the bones with tomato paste thinned with the vinegar and return to a 204 °C oven for 20 minutes.',
        temperatureC: 204,
        durationMinutes: 20,
        uses: ['Tomato paste', 'Red wine vinegar'],
        note: 'Pyrolising the sugars in the paste is what builds the crust.',
      },
      {
        phase: 'Roast',
        instruction:
          'Deglaze each sheet pan in turn with a cup of water, scraping the fond into a reserve bowl. Repeat until the pans run clear.',
      },
      {
        phase: 'Clarify',
        instruction:
          'Simmer the stock 12 hours, then strain through a China cap lined with cheesecloth to take out the large particulates.',
        durationMinutes: 720,
        technique: 'simmering',
      },
      {
        phase: 'Clarify',
        instruction:
          'Cool to 4 °C, add ice and lightly beaten egg whites, and bring slowly back to 71 °C so a protein raft forms and traps the fine impurities.',
        temperatureC: 71,
      },
      {
        phase: 'Clarify',
        instruction:
          'Pass through a colander lined with damp coffee filters for final optical clarity.',
      },
      {
        phase: 'Espagnole',
        instruction:
          'Whisk the flour into the clarified butter and cook to the hazelnut stage, about 121 °C. Fold in the caramelised mirepoix.',
        temperatureC: 121,
        uses: ['Butter', 'Wondra flour', 'Mirepoix'],
      },
      {
        phase: 'Reduce',
        instruction:
          'Stage one: 4 hours at 96 °C, reducing by 30%, with a sachet of dried mushroom aromatics.',
        durationMinutes: 240,
        temperatureC: 96,
        technique: 'reduction',
      },
      {
        phase: 'Reduce',
        instruction:
          'Stage two: 2 hours at 90 °C to 50% reduction, adding a cup of Pedro Ximénez sherry.',
        durationMinutes: 120,
        temperatureC: 90,
      },
      {
        phase: 'Reduce',
        instruction:
          'Stage three: 1 hour at 85 °C to 70% reduction, finishing with black garlic purée. Stir only with a flat-edged wooden spatula so nothing scorches.',
        durationMinutes: 60,
        temperatureC: 85,
      },
      {
        phase: 'Finish',
        instruction:
          'Suspend the kombu in the reduction for the final 30 minutes to draw out glutamates without picking up marine notes.',
        durationMinutes: 30,
        uses: ['Kombu'],
      },
      {
        phase: 'Store',
        instruction:
          'Cool to 10 °C within 20 minutes in an ice bath, portion into jars, and freeze at −30 °C so the gelatin matrix vitrifies instead of forming ice crystals.',
        temperatureC: 10,
      },
    ],
    notes: [
      {
        kind: 'science',
        title: 'Why each layer exists',
        body:
          'The dual bone foundation is doing three separate jobs: marrow for fat and mouthfeel, ' +
          'veal knuckle for gelatin, oxtail for concentrated meatiness. Dropping any one of them ' +
          'is a real loss rather than a simplification. The triple clarification is likewise ' +
          'three different mechanisms — mechanical, protein raft, adsorption — not the same ' +
          'step done three times.',
        sources: [
          {
            url: 'https://www.reluctantgourmet.com/demi-glace-recipe/',
            title: 'Reluctant Gourmet — demi-glace',
          },
          {
            url: 'https://chefjeanpierre.com/recipes/sauces/demi-glace-recipe/',
            title: 'Chef Jean-Pierre — demi-glace',
          },
          {
            url: 'https://www.thefrenchcookingacademy.com/recipes/home-style-demi-glace',
            title: 'French Cooking Academy — home-style demi-glace',
          },
          {
            url: 'https://guide.michelin.com/tw/en/article/dining-in/the-5-mother-sauces-of-french-cuisine',
            title: 'Michelin Guide — the five mother sauces',
          },
        ],
      },
      {
        kind: 'warning',
        title: 'Time is the actual ingredient',
        body: 'This is a 48–72 hour commitment. Every shortcut in it trades away the thing that makes it worth doing.',
      },
    ],
  },
};

const BEEF_WELLINGTON: RecipeSeed = {
  recipe: {
    slug: 'beef-wellington-technique',
    title: 'Beef Wellington: Moisture Control as the Whole Problem',
    summary:
      'Research on why Wellingtons fail and what the techniques that fix them are actually ' +
      'doing — octagonal searing, duxelles dehydration, layered moisture barriers and ' +
      'two-stage baking.',
    kind: 'research',
    categories: {
      cuisine: ['British', 'French'],
      technique: ['searing', 'baking'],
      course: ['main'],
      occasion: ['celebration'],
    },
    rationale: 'Transcribed from the archive research note.',
    notes: [
      {
        kind: 'science',
        title: 'The octagon sear',
        body:
          'Treating the tenderloin as eight flat faces plus two ends gives even caramelisation ' +
          'while keeping the interior raw. A cylinder seared with single flips browns unevenly ' +
          'and drives heat further into the centre, which is then overcooked by the bake.',
      },
      {
        kind: 'science',
        title: 'Duxelles as a moisture barrier, not a flavour layer',
        body:
          'Mushrooms are 80–90% water. The 25–30 minute cook removes about 90% of it; dry-sauté ' +
          'first, add fat after. Cream added near the end sounds like it should make things ' +
          'wetter and does the opposite — the fat emulsifies the residual water and stops it ' +
          'migrating into the pastry.',
      },
      {
        kind: 'science',
        title: 'Two barriers, two mechanisms',
        body:
          'Prosciutto works by fat solidifying during the chill into a semi-impermeable layer. ' +
          'A crêpe works by its egg protein structure absorbing a little moisture without ' +
          'collapsing. They are not interchangeable, and using both is not redundant.',
      },
      {
        kind: 'science',
        title: 'Temperature and carryover',
        body:
          'Start at 220 °C so the butter layers in the pastry expand and set structure before the ' +
          'beef heats, then drop to 190 °C for even penetration. Pull at 52–54 °C: carryover ' +
          'adds about 3 °C during the rest, landing at 54–57 °C for medium-rare.',
      },
      {
        kind: 'warning',
        title: 'Vent the pastry',
        body:
          'Steam pressure inside a sealed pastry case ruptures it unpredictably. One deliberate ' +
          'vent hole releases it in a controlled way.',
        sources: [
          {
            url: 'https://www.perplexity.ai/search/this-recipe-doesn-t-mention-ho-lYBPLacCTiOroTjc._KsTA',
            title: 'Original research thread',
          },
        ],
      },
      {
        kind: 'observation',
        title: 'Mushroom blend',
        body:
          'Cremini for the earthy base, shiitake for umami, dried porcini for concentrated ' +
          'woodland aroma. Rehydrate porcini in warm — not boiling — water for 20–30 minutes, ' +
          'agitate after five to release grit, lift them out rather than pouring, and strain ' +
          'and keep the soaking liquid. They expand three to four times.',
      },
    ],
  },
};

const PERI_PERI: RecipeSeed = {
  recipe: {
    slug: 'peri-peri-cocktail',
    title: 'Peri-Peri as a Cocktail',
    summary:
      'An idea that never got written down. Preserved so it does not get lost a second time.',
    kind: 'research',
    status: 'draft',
    categories: { cuisine: ['Portuguese'], course: ['drink'] },
    rationale:
      'The original archive file existed but was empty. Kept as a placeholder.',
    notes: [
      {
        kind: 'idea',
        title: 'Nothing here yet',
        body:
          'The archive file `docs/recipe_tinkering/peri-peri-as-a-cocktail.md` was created and ' +
          'never filled in. The premise — peri-peri as the backbone of a drink rather than a ' +
          'marinade — is worth working out: bird’s eye heat, lemon, garlic and oregano ' +
          'against something with enough sugar and body to carry them.',
      },
    ],
  },
};

export const RECIPES: RecipeSeed[] = [
  BILTONG,
  PICKLED_JALAPENOS,
  BERLIN_BOIL,
  DEMI_GLACE,
  BEEF_WELLINGTON,
  PERI_PERI,
];

export const RECIPE_LINKS: {
  from: string;
  to: string;
  kind: 'component_of' | 'references';
  note?: string;
}[] = [
  {
    from: 'demi-glace',
    to: 'beef-wellington-technique',
    kind: 'component_of',
    note: 'The red wine reduction served with a Wellington is built on this.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Experiments — the biltong batch logs
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build observations from compact per-piece rows.
 *
 * The batch logs record different columns per batch (batch 2 tracked final
 * weight and cutting date, batch 5 tracked gross/net/expected). Rather than
 * flattening them to a lowest common denominator, each batch declares the
 * metrics it actually measured.
 */
function observations(
  rows: readonly (readonly [
    label: string,
    ...values: (number | string | null)[],
  ])[],
  metrics: { metric: string; unit?: string }[],
): NonNullable<LogExperimentArgs['observations']> {
  const out: NonNullable<LogExperimentArgs['observations']> = [];
  for (const [label, ...values] of rows) {
    values.forEach((value, index) => {
      const spec = metrics[index];
      if (!spec || value == null) return;
      if (typeof value === 'string') {
        out.push({ item: label, metric: spec.metric, note: value });
      } else {
        out.push({
          item: label,
          metric: spec.metric,
          value,
          unit: spec.unit ?? null,
        });
      }
    });
  }
  return out;
}

const BATCH_2_ROWS = [
  ['A1', 694, 293, 23, 21.51],
  ['A2', 656, 304, 20, 20.33],
  ['A3', 640, 275, 21, 19.84],
  ['A4', 623, 242, 29, 19.31],
  ['A5', 533, 220, 29, 16.52],
  ['A6', 515, 235, 24, 15.96],
  ['A7', 552, 248, 15, 17.11],
  ['A8', 367, null, null, 11.38],
  ['A9', 248, 125, 9, 7.69],
  ['A10', 110, 65, 4, 3.41],
  ['A11', 140, 84, 6, 4.34],
  ['A12', 205, 102, 13, 6.35],
  ['A13', 362, 215, 13, 11.22],
  ['A14', 312, 146, 17, 9.67],
  ['A15', 202, 99, 6, 6.26],
] as const;

const BATCH_3_ROWS = [
  ['01', 571, 17.7],
  ['02', 423, 13.11],
  ['03', 673, 20.86],
  ['04', 540, 16.74],
  ['05', 574, 17.79],
  ['06', 267, 8.28],
  ['07', 373, 11.56],
  ['08', 322, 9.98],
  ['09', 446, 13.82],
  ['10', 359, 11.13],
  ['11', 222, 6.88],
  ['12', 315, 9.76],
  ['13', 248, 7.69],
  ['14', 298, 9.24],
  ['15', 171, 5.3],
  ['16', 162, 5.02],
  ['17', 152, 4.71],
  ['18', 160, 4.96],
] as const;

const BATCH_5_ROWS = [
  ['1', 310, 297, 133.7],
  ['2', 558, 545, 245.3],
  ['3', 567, 554, 249.3],
  ['4', 395, 382, 171.9],
  ['5', 786, 773, 348.0],
  ['6', 555, 542, 243.9],
  ['7', 702, 689, 310.1],
  ['8', 942, 929, 418.1],
  ['9', 524, 511, 229.9],
  ['11', 393, 380, 171.0],
  ['12', 436, 423, 190.4],
  ['13', 550, 537, 241.7],
  ['14', 471, 458, 206.1],
  ['15', 479, 466, 209.7],
  ['16', 219, 206, 92.7],
  ['17', 133, 120, 54.0],
  ['18', 160, 147, 66.2],
  ['19', 91, 78, 35.1],
  ['20', 96, 83, 37.4],
  ['21', 107, 94, 42.3],
] as const;

/** Cutting dates from batch 2, keyed by piece. */
const BATCH_2_CUT_DATES: Record<string, string> = {
  A1: '2024-10-12',
  A2: '2024-10-09',
  A3: '2024-10-10',
  A4: '2024-10-18',
  A5: '2024-10-18',
  A6: '2024-10-13',
  A7: '2024-10-04',
  A9: '2024-09-28',
  A10: '2024-09-23',
  A11: '2024-09-25',
  A12: '2024-10-02',
  A13: '2024-10-02',
  A14: '2024-10-06',
  A15: '2024-09-25',
};

export const EXPERIMENTS: LogExperimentArgs[] = [
  {
    slug: 'biltong-batch-2',
    title: 'Biltong Batch 2',
    recipeSlug: 'baumy-biltong',
    revisionNumber: 2,
    summary:
      '5.98 kg of Irish silverside, 15 pieces. The only batch with a complete ' +
      'record of both initial and final weights, which is where the 4.21%/day ' +
      'drying figure comes from.',
    startedAt: '2024-09-19',
    completedAt: '2024-10-18',
    costTotal: 185.36,
    currency: 'EUR',
    outcome:
      'Average loss of 13.48 g per piece per day, or 4.21% of initial weight per ' +
      'day. The rate is not linear: small pieces lose a far higher percentage ' +
      'daily (A10 at 10.23%/day) than large ones (A5 at 2.02%/day), so a single ' +
      'drying window across mixed sizes will always over-dry the small pieces.',
    items: BATCH_2_ROWS.map(([label]) => ({ label })),
    observations: [
      ...observations(BATCH_2_ROWS, [
        { metric: 'initial_weight', unit: 'g' },
        { metric: 'final_weight', unit: 'g' },
        { metric: 'days_to_cut', unit: 'days' },
        { metric: 'piece_cost', unit: 'EUR' },
      ]),
      ...Object.entries(BATCH_2_CUT_DATES).map(([label, date]) => ({
        item: label,
        metric: 'cut_date',
        recordedAt: date,
        note: date,
      })),
    ],
    notes: [
      {
        kind: 'result',
        title: 'Drying rate is size-dependent',
        body:
          'Daily loss ≈ 4.21% of initial weight, but the spread runs from 2.02% ' +
          '(533 g piece) to 10.23% (110 g piece). Treat the average as a planning ' +
          'figure for medium pieces only and pull the small ones early.',
      },
      {
        kind: 'observation',
        title: 'A8 was never recorded',
        body: 'Piece A8 (367 g) has no final weight or cutting date in the log.',
      },
      {
        kind: 'warning',
        title: 'Two costs are recorded for this batch',
        body:
          'The batch log says €185.36 and the running notes say €168.36 for the ' +
          'silverside. The per-piece costs in this record sum to the €185.36 ' +
          'figure, so that is the one used here.',
      },
    ],
  },
  {
    slug: 'biltong-batch-3',
    title: 'Biltong Batch 3',
    recipeSlug: 'baumy-biltong',
    revisionNumber: 3,
    summary:
      '6.02 kg from Gourmet Experts, 18 pieces. Initial weights and per-piece ' +
      'costs recorded; the batch was never weighed out at cutting.',
    startedAt: '2024-10-18',
    costTotal: 157.88,
    currency: 'EUR',
    items: BATCH_3_ROWS.map(([label]) => ({ label })),
    observations: observations(BATCH_3_ROWS, [
      { metric: 'initial_weight', unit: 'g' },
      { metric: 'piece_cost', unit: 'EUR' },
    ]),
    notes: [
      {
        kind: 'observation',
        title: 'No final weights',
        body:
          'The outcome columns were never filled in, so this batch contributes ' +
          'spice ratios but nothing to the drying model.',
      },
    ],
  },
  {
    slug: 'biltong-batch-4',
    title: 'Biltong Batch 4',
    recipeSlug: 'baumy-biltong',
    revisionNumber: 4,
    summary:
      '7.98 kg of Irish silverside. No per-piece log kept; the useful output was ' +
      'the discovery that the dredge ran out.',
    startedAt: '2024-11-29',
    costTotal: 209.26,
    currency: 'EUR',
    outcome:
      '1.6 kg of meat was not covered by the dredge and needed a second, ' +
      'separately calculated batch of seasoning mixed on the spot.',
    notes: [
      {
        kind: 'result',
        title: 'Dredge volume is the binding constraint',
        body:
          'The spice was scaled correctly by weight and still ran out by volume. ' +
          'Everything from batch 5 onward sizes the dredge for coverage.',
      },
    ],
  },
  {
    slug: 'biltong-batch-5',
    title: 'Biltong Batch 5',
    recipeSlug: 'baumy-biltong',
    revisionNumber: 5,
    summary:
      '8.2 kg of Irish silverside in 21 pieces (hook 10 missing). Larger loins ' +
      'meant fewer, bigger sections than previous batches.',
    startedAt: '2025-07-18',
    costTotal: 216.61,
    currency: 'EUR',
    outcome:
      'Net weight 8,214 g across 20 recorded pieces, averaging 410.7 g. Largest ' +
      'piece 929 g net, smallest 78 g. Expected dried yield ≈ 3,697 g at 45% of ' +
      'net, over a projected 13–15 day window.',
    items: BATCH_5_ROWS.map(([label]) => ({ label })),
    observations: observations(BATCH_5_ROWS, [
      { metric: 'gross_weight', unit: 'g' },
      { metric: 'net_weight', unit: 'g' },
      { metric: 'expected_dried_weight', unit: 'g' },
    ]),
    notes: [
      {
        kind: 'observation',
        title: 'Net = gross − 13 g hook',
        body: 'Expected dried weight is net × 0.45, i.e. a 55% loss.',
      },
      {
        kind: 'observation',
        title: 'Estimated total cost €240.71',
        body:
          'Meat at €216.61 plus roughly €24 of wash and spice, the largest single ' +
          "line being 80 g of piment d'Espelette at about €9.60.",
      },
    ],
  },
];
