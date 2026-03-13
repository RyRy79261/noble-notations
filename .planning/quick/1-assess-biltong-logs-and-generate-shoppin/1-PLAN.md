---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/biltong_logs/batch6_prep.md
autonomous: true
requirements: [QUICK-1]

must_haves:
  truths:
    - "Document traces the evolution of recipe across all 5 batches"
    - "All batch 5 learnings (30% more wash, 40% more seasoning) are applied to the scaled recipe"
    - "Shopping list has exact gram quantities for a 10kg batch"
    - "Substitutions from batch 5 are resolved back to intended ingredients where possible"
  artifacts:
    - path: "docs/biltong_logs/batch6_prep.md"
      provides: "Batch 6 preparation guide with analysis and shopping list"
      contains: "Shopping List"
  key_links: []
---

<objective>
Analyze all biltong batch logs (1-5), trace the recipe evolution, scale the refined recipe to 10kg, and produce a comprehensive batch 6 preparation document with shopping list.

Purpose: Give Ryan a single reference document for his next 10kg batch with exact quantities, incorporating all learnings.
Output: docs/biltong_logs/batch6_prep.md
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/Biltong.md
@docs/biltong_logs/batch2.md
@docs/biltong_logs/batch3.md
@docs/biltong_logs/batch4.md
@docs/biltong_logs/batch5.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Analyze batch evolution and create batch 6 prep document</name>
  <files>docs/biltong_logs/batch6_prep.md</files>
  <action>
Create docs/biltong_logs/batch6_prep.md with the following sections. Use Docusaurus frontmatter (title: "Biltong Batch 6 — Prep & Shopping List").

## Section 1: Recipe Evolution Summary

A concise table or summary showing how the recipe changed across batches 1-5:

| Batch | Weight | Salt (g/kg) | Pepper (g/kg) | Coriander (g/kg) | Star Anise (/kg) | Masala | Wash (g/kg) | Key Changes |
Populate per-kg ratios from each batch so trends are visible.

Key evolution notes to highlight:
- Batch 1: No wash, basic spices only
- Batch 2: First wash introduced (141g for 5.98kg). 20% salt reduction from batch 1. Note: "need 20% more wash". Forgot garam masala.
- Batch 3: Wash unchanged from batch 2 despite note to increase. Added tandoori masala (1/3 of spice weight) and garam masala. 10% salt reduction from base.
- Batch 4: Wash scaled up properly (~197g for 7.98kg). Added cayenne and ancho chilies. Note: 1.6kg wasn't covered by dredge seasoning — need more volume.
- Batch 5: Wash was short (used 70g worcestershire vs calculated 99.4g). Multiple substitutions due to stock issues. Key notes: "increase wash by 30%", "increase seasoning volume by 40%", "finer grind needs more volume".

## Section 2: Batch 6 Calculated Recipe (10kg)

**Scaling approach:** Use batch 4's calculated recipe as the "intended" base (most complete without substitutions), scaled to 10kg, then apply batch 5's learnings.

**Wash calculation for 10kg:**
Take batch 4's wash ratios per kg (which were properly scaled), scale to 10kg, then apply the +30% increase from batch 5 notes.

Batch 4 wash for 7.98kg:
- 99.4g worcestershire = 12.46 g/kg
- 27.8g red wine vinegar = 3.48 g/kg
- 22.5g apple cider vinegar = 2.82 g/kg
- 26.5g condimento blanco = 3.32 g/kg
- 21.2g black malt vinegar = 2.66 g/kg

For 10kg with +30% increase:
- Worcestershire: 12.46 * 10 * 1.3 = 162.0g
- Red wine vinegar: 3.48 * 10 * 1.3 = 45.2g
- Apple cider vinegar: 2.82 * 10 * 1.3 = 36.7g
- Condimento blanco: 3.32 * 10 * 1.3 = 43.2g
- Black malt vinegar: 2.66 * 10 * 1.3 = 34.6g
- Total wash: ~321.7g

**Seasoning calculation for 10kg:**
Take batch 4's calculated amounts per kg, scale to 10kg, then apply the +40% volume increase from batch 5 notes.

Batch 4 seasoning for 7.98kg (main batch only, not the extra 1.6kg portion):
- 110.5g salt = 13.85 g/kg (already has the 10% reduction baked in)
- 13.9g black pepper = 1.74 g/kg
- 47.3g coriander = 5.93 g/kg
- 9.5 star anise = 1.19 /kg
- 107.4g tandoori masala = 13.46 g/kg
- 10g cayenne = 1.25 g/kg
- Chilies: ~2.76 g/kg deseeded

For 10kg with +40% increase:
- Salt: 13.85 * 10 * 1.4 = 193.9g (IMPORTANT: double-check this feels right — batch 5 used 110.5g for 8.2kg which is 13.48 g/kg without any increase. The 40% note was about seasoning volume for coverage, not necessarily salt. Consider keeping salt at the per-kg rate WITHOUT the 40% bump — salt at 138.5g. Apply the 40% to the non-salt seasonings only. Note this decision clearly in the document and let Ryan decide.)
- Black pepper: 1.74 * 10 * 1.4 = 24.4g
- Coriander: 5.93 * 10 * 1.4 = 83.0g
- Star anise: 1.19 * 10 * 1.4 = ~17 pods
- Tandoori masala: 13.46 * 10 * 1.4 = 188.4g
- Garam masala: Include ~5-8g (was in batch 3 at 3g for 6kg, and batch 5 used 54g but that was compensating for tandoori shortage). Suggest 8g as a supporting spice, not a tandoori substitute.
- Cayenne: 1.25 * 10 * 1.4 = 17.5g
- Chilies: scale to ~8-10 chipotle, 4-5 guajillo, optional ancho

Present TWO columns: "Conservative (salt not bumped)" and "Full +40% (all spices including salt)" so Ryan can choose.

## Section 3: Shopping List

A clear shopping list organized by category:

**Meat:**
- 10kg Irish Silverside (Gourmet Experts)

**Wash ingredients:**
List each with exact grams, round to practical amounts.

**Dry spices:**
List each with exact grams. Include a "buy at least" column that rounds up to nearest common package size.

**Chilies:**
List by type and count.

**Equipment reminders:**
- Hooks (estimate ~25-30 pieces for 10kg based on batch 5's 21 pieces for 8.2kg)
- Note about weighing pieces before fridge rest (from batch 5 learnings)

## Section 4: Process Notes from Batch History

Compile the key process learnings:
- Grind coriander coarsely / separately (batches 3, 4, 5)
- Temperature of meat affects wash usability — work quickly (batch 5)
- Weigh sections before placing in fridge for dry brine (batch 5)
- Ensure enough dredge to cover all meat — the 1.6kg shortage in batch 4 (batch 4)
- Finer grind = need more volume (batch 5)
- Average daily weight loss ~4.21% of initial weight (batch 2 analysis)
- Expected yield ~45% of net weight (batch 5)

Format the document cleanly with markdown tables where appropriate. Use the same casual but informative tone as the existing batch logs.
  </action>
  <verify>
    <automated>test -f docs/biltong_logs/batch6_prep.md && grep -q "Shopping List" docs/biltong_logs/batch6_prep.md && grep -q "Wash" docs/biltong_logs/batch6_prep.md && grep -q "10kg" docs/biltong_logs/batch6_prep.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - Document exists at docs/biltong_logs/batch6_prep.md
    - Contains recipe evolution summary across all 5 batches with per-kg ratios
    - Contains scaled wash recipe for 10kg with +30% applied
    - Contains scaled seasoning recipe for 10kg with +40% applied (with salt caveat noted)
    - Contains organized shopping list with practical quantities
    - Contains process notes compiled from batch history
    - Two seasoning options presented (conservative vs full bump) for Ryan to decide on salt
  </done>
</task>

</tasks>

<verification>
- File exists and renders as valid markdown
- All 5 batches referenced in evolution summary
- Quantities are mathematically consistent with the scaling methodology described
- Batch 5 learnings (+30% wash, +40% seasoning) visibly applied
</verification>

<success_criteria>
Ryan can read batch6_prep.md and go shopping with exact quantities, understanding why each amount was chosen and how it evolved from previous batches.
</success_criteria>

<output>
After completion, create `.planning/quick/1-assess-biltong-logs-and-generate-shoppin/1-SUMMARY.md`
</output>
