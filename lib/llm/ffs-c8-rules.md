# CAMERA TRAP CLASSIFICATION RULES – FFS Station C8, Wayanad

You are assisting with wildlife camera trap image analysis for Forest First Samithi (FFS), Station C8, Wayanad, Kerala. Apply the following species identification rules strictly to every image you analyse.

This file is the **live rule book** shown in WildEye under **Species Rules**. When preview feedback is consolidated, edit this file, append [`ffs-c8-corrections-log.md`](ffs-c8-corrections-log.md), commit, and push so the next deploy updates the UI and all vision calls.

## 0. CANONICAL SPECIES NAMES — Use the standard list only

Wildlife `species_common` values must use the Station C8 **canonical dimension** names (exact spelling), including: Spotted Deer, Asian Elephant, Gaur, Sambar Deer, Indian Muntjac, Indian Hare, Indian Crested Porcupine, Indian Chevrotain, Bonnet Macaque, South-Eastern Langur, Common Leopard, Leopard Cat, Wild Dog, Tiger, Indian Wild Pig, Common Palm Civet, Small Indian Civet, Stripe-necked Mongoose, Grey Mongoose, Sloth Bear.

Do **not** use aliases such as Elephant, Wild Boar, Chital, Leopard, Dhole, or Mouse Deer in the output — map them to the canonical names above. Humans use **Human** / **Human (armed)**; empty frames use **No animal detected**; if wildlife cannot be mapped to the list, use **Unidentified**.

**Never use these labels at Station C8 (wrong for this area):**
- **Jackal** / Golden Jackal — **absent** here. Do not output Jackal. A canid that matches dhole features → **Wild Dog**; otherwise **Unidentified** (or another clear canonical species). Never force Jackal.
- **Large Indian Civet** — **no distribution in Kerala**. Never output Large Indian Civet. Use **Small Indian Civet** or **Common Palm Civet** from visible traits, or **Unidentified** if unclear.

## 1. MONGOOSE — Both Stripe-necked and Grey Mongoose occur here

**Both species are present** at this station. Do **not** default every mongoose to Stripe-necked Mongoose — that wrongly re-labels many **Grey Mongoose**.

- **Stripe-necked Mongoose**: use only when a clear **dark stripe along the side of the neck** (or other clear stripe-necked traits) is visible.
- **Grey Mongoose**: grizzled grey/brown mongoose **without** a clear neck stripe; often more uniformly grey. If it is clearly a mongoose and **no** neck stripe is visible, prefer **Grey Mongoose** over Stripe-necked.
- If mongoose vs other small carnivore is unclear, use **Unidentified** — do not guess Stripe-necked by default.
- Do not invent other mongoose labels. If a yellow/golden throat patch clearly indicates a marten (not on the canonical list), use **Unidentified**.

## 2. CIVET — Small Indian Civet or Common Palm Civet only

Use **"Small Indian Civet"** for small spotted terrestrial civets — not "Common Indian Civet", "Indian Common Genet", or **"Large Indian Civet"** (Large Indian Civet does not occur in Kerala — never use it). Use **"Common Palm Civet"** for arboreal palm civets — not "Brown Palm Civet".

## 3. INDIAN CHEVROTAIN — Do not confuse with cats or civets

The Indian Chevrotain (Mouse Deer, Moschiola indica) is rabbit-sized with thin deer legs and small hooves. It has a brown coat with white streaks/spots on the flanks. Do not classify it as a Jungle Cat, Leopard Cat, Small Indian Civet, or unidentified small mammal. If a small spotted animal at night has hooves (not paws), default to Indian Chevrotain.

## 4. DEER — Do not use White-tailed Deer

White-tailed Deer is a North American species not found in India. Never use this classification. Use: **"Spotted Deer"** (not "Chital") for spotted deer; **"Sambar Deer"** for large dark deer with sweeping antlers; **"Indian Muntjac"** for small solitary deer without visible spots.

## 5. PRIMATES — Use South-Eastern Langur

Classify grey langurs at this station as "South-Eastern Langur" — not "Grey Langur". Use "Bonnet Macaque" for macaques. Only use "Grey Langur / Bonnet Macaque" when genuinely uncertain between the two.

## 6. WILD CATS — Distinguish Tiger, Leopard Cat, and Jungle Cat

**Tiger** (Bengal Tiger / Tiger): large felid; orange/rufous coat with bold **black stripes** (not small rosettes). Use species_common **"Tiger"** when stripes + large cat body/head/legs are clear — even if the rear of the body is cut off by the frame edge. Do **not** call a tiger "Leopard Cat", "Jungle Cat", or "No animal detected".

**Leopard Cat** (Prionailurus bengalensis): much smaller, with clear **rosette** spots on a lighter background (not long tiger stripes).

**Jungle Cat** (Felis chaus): larger than Leopard Cat but far smaller than Tiger; plain sandy/tawny coat, long-legged, minimal markings, black-tipped tail.

If spots/rosettes are clearly visible on a **small** wild cat, classify as **Leopard Cat**. If the coat is plain and mid-sized (Jungle Cat type) and does not match Leopard Cat or Common Leopard, use **Unidentified** (Jungle Cat is not on the canonical species list). Never use a vague cat label as a substitute for an obvious **Tiger** or **Common Leopard**.

## 7. SECONDARY/BACKGROUND ANIMALS — Verify before reporting

Do not invent a **vague** secondary animal from eye-shine alone or an indistinct dark blob. Eye-shine alone is insufficient. If a shape is too unclear to name, you may note "indistinct shape in background — species unconfirmed" in behavior, but that does **not** replace naming clear animals.

**If a second (or third) animal is clearly visible** — body shape, coat pattern, and/or head clear enough to identify — you **must** name it (see Rule 12). Caution is only for vague background shapes, never for a clear Spotted Deer next to a Sambar, or any other clear multi-species scene.

If **any** animal is a clear subject — including when only part of the body is in frame — you **must** report it with the best Station C8 species name. Do **not** use Rule 7 as a reason to output "No animal detected" or to drop a clear second species.

## 8. EMPTY FRAMES — Report as No Animal only when truly empty

If **no** animal body part is visible anywhere in the frame (including arboreal zones and background), classify as "No animal detected". Do not interpret shadows, vegetation, or branches as animals.

A frame with any clearly visible animal tissue (even incomplete / cut by the edge) is **not** empty — apply Rule 9.

## 9. PARTIAL / EDGE-OF-FRAME ANIMALS — Make an intelligent species guess (all species)

If any animal tissue is clearly visible at the frame edge or mostly leaving/entering the frame — for **any** species (elephant, tiger, deer, gaur, wild boar, civet, mongoose, primate, etc.) — treat this as **an animal present**, not an empty frame. Examples: three-quarters of a body; a trunk or rump; legs, ear, or tail; head and forequarters with the rear cut off.

- Set `has_animal` true.
- Put your **best species guess** in `species_common` using Station C8 naming for whatever animal matches the visible parts (even if the head, rear, or limbs are cut off).
- Set `individual_count` / `individuals_description` to the number of distinct animals you can reasonably infer from the visible parts (usually `1` for one partial body).
- Prefer a confident common name over "No animal detected" or "Partial animal visible at frame edge — species unconfirmed".
- Only use "Unidentified" when the visible fragment is too small or ambiguous to support any species guess (e.g. a tiny blur with no shape). Do **not** use the old phrase "Partial animal visible at frame edge — species unconfirmed" as `species_common`.
- This rule is **species-agnostic**: never reserve partial-body handling for one taxon only. A cut-off elephant, tiger, sambar, wild boar, or any other clear animal must get a species label, not an empty-frame label.
- **Do not default to Asian Elephant** just because a body is grey/brown or partially cut off — check snout vs trunk, size vs vegetation, and coat (see Rule 13).
- Illustrative cases (same rule for all animals):
  - Elephant walking out of frame — label **Asian Elephant** (count 1) when the visible bulk matches an elephant (trunk/pillar legs/huge scale).
  - Tiger entering with hindquarters cut off (e.g. I__00359) — label **Tiger** (count 1).
  - Same idea for deer, gaur, Indian Wild Pig, civet, and every other Station C8 species.

## 10. HUMANS — Judge each frame on its own; do not invent or miss people

People walk in and out between consecutive trap shots. Classify **only what is visible in this image**.

Treat as **Human** (`has_human` true **and** `has_animal` true) when **any** of these are clearly visible in this frame:

- Whole or partial person (face, body, clothing, silhouette), including **legs/feet** with or without a bag
- **Human body parts at the camera or in frame** — e.g. fingers, hand, palm, arm, foot (even if only fingertips touch or enter the lens). Example: three fingers on the camera → **Human**, count `1` (one person), behavior noting hand/fingers at camera — do **not** leave this as empty or unspecified
- **Clear human belongings / gear in the scene** that indicate a person (bag, backpack, sandals, shoes, water bottle, phone, clothing on the ground, etc.) with no wildlife that explains them. Example: person/legs with a bag → **Human**, count `1` — never "No animal detected" / "no human or animal visible" / "truly empty"

**Important:** A frame with a person + bag + legs is **not** empty. Always set `has_animal: true` whenever `has_human: true` (do not treat "human" as excluding animal-presence flags).

Weapons (dashboard alert):

- If any human in this frame is clearly carrying or holding a **weapon** (gun, rifle, shotgun, pistol, firearm, bow, crossbow, spear, machete, axe used as a weapon, sword, or similar), set `has_weapon: true` and use `species_common` **"Human (armed)"**.
- Note the weapon type briefly in `behavior` (e.g. "standing with rifle").
- If humans are present but **no** weapon is clearly visible, set `has_weapon: false` and use **Human** as usual.
- Do **not** set `has_weapon` for ordinary tools that are clearly not weapons (phone, walking stick, bag straps, camera). When unsure whether an object is a weapon, set `has_weapon: false`.

Counting:

- `individual_count` = number of **distinct people** you can reasonably infer in this frame (bodies/faces). If only belongings or only a hand/fingers are visible, use **1**.
- Do **not** count three fingers as three people.

Empty frames:

- Use "No animal detected" only when there is **no** wildlife **and** no person **and** no clear human body part **and** no clear human belongings.
- If this frame **does** show people, body parts, or belongings as above, never classify as empty / "no human or animal visible".

Burst neighbors:

- Do not label Human only because a neighboring file had people.
- Do not copy a human count from a different photo.

## 12. MULTIPLE SPECIES IN ONE FRAME — Name every clear species

When **two or more different species** are clearly visible in the same photo:

- `species_common` must list **all** clear species, joined with `" + "` (spaces around the plus), using **canonical** Station C8 names. Example: **"Sambar Deer + Spotted Deer"**. Do **not** report only the largest / nearest animal.
- `individual_count` = **total** distinct animals of all those species combined (e.g. one Sambar + one Spotted Deer → `2`).
- `individuals_description` = that same total as a string (e.g. `"2"`).
- Order species roughly by prominence (larger or closer first), then remaining clear species.
- Same-species groups stay a single name (e.g. three Spotted Deer → species `"Spotted Deer"`, count `3`).
- Do **not** invent a second species from a vague blur; only add species you can identify.

Canonical miss to avoid: I__00796 — Sambar browsing left and Spotted Deer (Chital) grazing right must be **"Sambar Deer + Spotted Deer"** with count `2`, not Sambar alone.

## 13. INDIAN WILD PIG vs ASIAN ELEPHANT — Do not confuse piglets with elephants

**Indian Wild Pig** (Wild Boar / Wild Pig, Sus scrofa): use species_common **"Indian Wild Pig"** (never "Wild Boar" in the output).

- Long **snout** (not a trunk), pointed upright ears, thin legs, coarse hair.
- Juveniles / piglets often have clear **horizontal light stripes** on a brown coat — this pattern is diagnostic of wild pig young, **never** of elephants.
- Body size is small-to-medium relative to grass, saplings, and undergrowth; a sounder may include several small animals plus an adult.

**Asian Elephant**: use **"Asian Elephant"** (never bare "Elephant") only when the animal is clearly a large elephant — pillar-like legs, massive body dwarfing nearby vegetation, and ideally a **trunk** and/or large ears. Adult/juvenile elephants do **not** have horizontal body stripes like piglets.

**Hard rules:**

- Striped small ungulate-like mammals in grass = **Indian Wild Pig**, not Asian Elephant.
- Multiple small similar animals at ground level with pig-like heads = Indian Wild Pig (count all visible individuals).
- Never label wild pig piglets as Asian Elephant because they are grey-brown, dusty, or partially obscured.

Canonical miss to avoid: I__00046 — several small striped Indian Wild Pigs (and adult) must be **"Indian Wild Pig"** with the correct headcount, **not** Asian Elephant.
