/**
 * Authored taxonomy: display labels, explanatory blurbs and hierarchy.
 *
 * Terms are created on demand by `resolveTermId` whenever a recipe is tagged,
 * which gets the slug right but leaves the label as whatever string was
 * written and the description empty. This file is the curated pass over
 * them: it fixes casing and supplies the blurb the UI shows on hover, so a
 * reader who does not know what "dry-brining" or a "china cap" is can find
 * out without leaving the page.
 *
 * A term listed here that does not exist yet is created. Terms not listed
 * are left alone — the MCP `upsert_taxonomy_term` tool describes those as
 * they arrive, and an undescribed term still renders, just without a blurb.
 *
 * Note `air-drying` and `pickling` appear under both `technique` and
 * `preservation` with different blurbs. That is the point of facets: one is
 * the physical action, the other is what the action achieves. Terms never
 * cross facets, so the two never collide.
 */
import type { TaxonomyFacet } from '@/lib/domain/schemas';

export interface TaxonomyTermSeed {
  facet: TaxonomyFacet;
  slug: string;
  label: string;
  description: string;
  /** Slug of a parent term in the same facet, for hierarchy. */
  parent?: string;
}

export const TAXONOMY: TaxonomyTermSeed[] = [
  // ── Cuisine ────────────────────────────────────────────────────────────
  {
    facet: 'cuisine',
    slug: 'american',
    label: 'American',
    description:
      'The regional cooking of the United States — a parent grouping for its distinct local traditions rather than a style in its own right.',
  },
  {
    facet: 'cuisine',
    slug: 'british',
    label: 'British',
    description:
      'Cooking of the British Isles: roasts, pies, puddings and preserves, built around long oven heat and a strong preserving tradition.',
  },
  {
    facet: 'cuisine',
    slug: 'cajun',
    label: 'Cajun',
    description:
      'Louisiana country cooking from French-speaking Acadian settlers. Built on a dark roux and the "holy trinity" of onion, celery and green pepper, and usually cooked down in one pot.',
    parent: 'american',
  },
  {
    facet: 'cuisine',
    slug: 'french',
    label: 'French',
    description:
      'The codified European tradition of stocks, mother sauces and precise knife work — the source of most professional kitchen vocabulary.',
  },
  {
    facet: 'cuisine',
    slug: 'german',
    label: 'German',
    description:
      'Central European cooking with a deep charcuterie and pickling tradition: cured pork, sour vegetables, rye and beer.',
  },
  {
    facet: 'cuisine',
    slug: 'mexican',
    label: 'Mexican',
    description:
      'Mesoamerican cooking built on nixtamalised corn, dried and fresh chillies, and toasted aromatics ground into sauces.',
  },
  {
    facet: 'cuisine',
    slug: 'portuguese',
    label: 'Portuguese',
    description:
      'Atlantic cooking of salt cod, piri-piri, olive oil and slow pork — a major influence on South African and Mozambican food.',
  },
  {
    facet: 'cuisine',
    slug: 'south-african',
    label: 'South African',
    description:
      'A layered cuisine of Dutch, Malay, British, Portuguese and indigenous traditions. Strong on open-fire cooking and dried, spiced meat.',
  },

  // ── Course ─────────────────────────────────────────────────────────────
  {
    facet: 'course',
    slug: 'condiment',
    label: 'Condiment',
    description:
      'Served alongside rather than in a dish — added by the eater, to taste, at the table.',
  },
  {
    facet: 'course',
    slug: 'drink',
    label: 'Drink',
    description: 'Anything served in a glass, alcoholic or not.',
  },
  {
    facet: 'course',
    slug: 'main',
    label: 'Main',
    description: 'The centrepiece of a meal, carrying most of its substance.',
  },
  {
    facet: 'course',
    slug: 'sauce',
    label: 'Sauce',
    description:
      'A liquid or emulsion built to dress something else. Unlike a condiment it is usually applied in the kitchen, not at the table.',
  },
  {
    facet: 'course',
    slug: 'snack',
    label: 'Snack',
    description: 'Eaten between meals and usually out of hand.',
  },

  // ── Technique ──────────────────────────────────────────────────────────
  {
    facet: 'technique',
    slug: 'air-drying',
    label: 'Air-drying',
    description:
      'Removing moisture by moving unheated air across the surface. As a technique this is about airflow, humidity and time — the physical act rather than its preserving effect.',
  },
  {
    facet: 'technique',
    slug: 'baking',
    label: 'Baking',
    description:
      'Cooking by dry, enveloping oven heat, where the food browns from the outside in.',
  },
  {
    facet: 'technique',
    slug: 'boiling',
    label: 'Boiling',
    description:
      'Cooking in liquid at a full rolling boil, around 100°C. Fast and agitating — it emulsifies and breaks things apart.',
  },
  {
    facet: 'technique',
    slug: 'butchery',
    label: 'Butchery',
    description:
      'Breaking down a carcass or primal cut: seam-cutting along muscle groups, trimming silverskin, and cutting with or against the grain.',
  },
  {
    facet: 'technique',
    slug: 'clarification',
    label: 'Clarification',
    description:
      'Removing suspended solids from a liquid to leave it transparent — by raft, straining, gelatin filtration or settling.',
  },
  {
    facet: 'technique',
    slug: 'dry-brining',
    label: 'Dry-brining',
    description:
      'Salting a surface and letting the drawn-out moisture dissolve the salt and reabsorb. Seasons throughout and improves browning without adding water, unlike a wet brine.',
  },
  {
    facet: 'technique',
    slug: 'dry-curing',
    label: 'Dry-curing',
    description:
      'Packing in salt, and usually nitrite, to draw out water and make the meat inhospitable to spoilage organisms before drying.',
  },
  {
    facet: 'technique',
    slug: 'grinding',
    label: 'Grinding',
    description:
      'Reducing solids to particles. Grind coarseness controls how fast aromatics release and how a spice reads on the palate.',
  },
  {
    facet: 'technique',
    slug: 'pickling',
    label: 'Pickling',
    description:
      'Submerging in an acidic liquid. As a technique this is about the brine ratio, aromatics and steep time.',
  },
  {
    facet: 'technique',
    slug: 'reduction',
    label: 'Reduction',
    description:
      'Simmering a liquid to evaporate water, concentrating flavour and thickening through dissolved solids rather than added starch.',
  },
  {
    facet: 'technique',
    slug: 'roasting',
    label: 'Roasting',
    description:
      'Dry heat, usually uncovered and at higher temperature than baking, to brown a surface while the interior cooks through.',
  },
  {
    facet: 'technique',
    slug: 'searing',
    label: 'Searing',
    description:
      'Brief contact with a very hot surface to drive the Maillard reaction. It browns, it does not "seal in juices".',
  },
  {
    facet: 'technique',
    slug: 'simmering',
    label: 'Simmering',
    description:
      'Holding liquid just below the boil, around 85–95°C, so bubbles break gently. Keeps stocks clear and proteins tender where boiling would cloud and toughen them.',
  },

  // ── Diet ───────────────────────────────────────────────────────────────
  {
    facet: 'diet',
    slug: 'gluten-free',
    label: 'Gluten-free',
    description:
      'Contains no wheat, barley, rye or their derivatives. Check the specific brands used — malt vinegar and soy sauce are common hidden sources.',
  },
  {
    facet: 'diet',
    slug: 'vegan',
    label: 'Vegan',
    description: 'No animal products at all, including dairy, egg and honey.',
  },

  // ── Season ─────────────────────────────────────────────────────────────
  {
    facet: 'season',
    slug: 'summer',
    label: 'Summer',
    description:
      'Suited to warm weather, or dependent on produce at its summer peak.',
  },

  // ── Equipment ──────────────────────────────────────────────────────────
  {
    facet: 'equipment',
    slug: 'china-cap',
    label: 'China cap',
    description:
      'A rigid cone-shaped metal strainer with perforated holes. Coarser than a chinois; used to strain stocks and to press solids through with a ladle.',
  },
  {
    facet: 'equipment',
    slug: 'drying-box',
    label: 'Drying box',
    description:
      'An enclosed cabinet with a fan and often a low heat source, holding steady airflow and humidity for curing meat.',
  },
  {
    facet: 'equipment',
    slug: 'fine-mesh-sieve',
    label: 'Fine-mesh sieve',
    description:
      'A woven wire strainer fine enough to catch spice grit and coagulated protein — the last pass before a liquid is called clear.',
  },
  {
    facet: 'equipment',
    slug: 'propane-burner',
    label: 'Propane burner',
    description:
      'A high-output outdoor gas ring. Delivers far more heat than a domestic hob, which matters for large stockpots and hard boils.',
  },
  {
    facet: 'equipment',
    slug: 'spice-grinder',
    label: 'Spice grinder',
    description:
      'A blade or burr mill for whole spices. Grinding to order preserves the volatile aromatics that pre-ground spice has already lost.',
  },
  {
    facet: 'equipment',
    slug: 'stockpot',
    label: 'Stockpot',
    description:
      'A tall, narrow, high-volume pot. The shape limits the evaporating surface so a long simmer reduces slowly.',
  },

  // ── Occasion ───────────────────────────────────────────────────────────
  {
    facet: 'occasion',
    slug: 'celebration',
    label: 'Celebration',
    description:
      'Made for an occasion that justifies the effort or the expense.',
  },
  {
    facet: 'occasion',
    slug: 'party',
    label: 'Party',
    description:
      'Scales to a crowd and holds up on a table without needing to be served hot to order.',
  },

  // ── Preservation ───────────────────────────────────────────────────────
  {
    facet: 'preservation',
    slug: 'air-drying',
    label: 'Air-drying',
    description:
      'Preserving by lowering water activity until spoilage organisms cannot grow. The same physical act as the technique of the same name, classified here by what it achieves.',
  },
  {
    facet: 'preservation',
    slug: 'curing',
    label: 'Curing',
    description:
      'Preserving with salt, and often nitrite, which both draws out water and directly inhibits bacteria — notably Clostridium botulinum.',
  },
  {
    facet: 'preservation',
    slug: 'pickling',
    label: 'Pickling',
    description:
      'Preserving by dropping pH below about 4.6, where most pathogens cannot grow. Either by added acid or by fermentation.',
  },

  // ── Texture ────────────────────────────────────────────────────────────
  {
    facet: 'texture',
    slug: 'chewy',
    label: 'Chewy',
    description:
      'Resists the bite and needs working. In dried meat this is a target, set by how far the drying was taken.',
  },
  {
    facet: 'texture',
    slug: 'crisp',
    label: 'Crisp',
    description: 'Fractures cleanly under the tooth with an audible snap.',
  },
  {
    facet: 'texture',
    slug: 'silky',
    label: 'Silky',
    description:
      'Smooth and coating on the tongue, with no perceptible grain — usually from emulsification or fine straining.',
  },
];
