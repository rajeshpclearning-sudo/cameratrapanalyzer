# FFS Station C8 — Corrections log

This log is shown in WildEye under **Species Rules**.  
When accuracy feedback is consolidated into `ffs-c8-rules.md` and committed to GitHub, **append a new row at the top** of the table below (newest first).

| Date | Issue | Rule change |
|------|--------|-------------|
| 2026-11-02 | In-app Species Rules + preview error feedback | Species Rules page + pending feedback in next analysis; corrections log updates on every rules git commit |
| 2026-10-24 | Highlight humans with weapons in red on dashboard | Rule 10 weapons subsection; `has_weapon` in vision JSON; species **Human (armed)**; UI red row/badge |
| 2026-10-24 | I__00134 still empty despite person+bag+legs | Fix normalize bug (`has_human` with `has_animal` false was forced to empty); vision detail high; Rule 10 requires `has_animal` true with `has_human`; legs+bag called out |
| 2026-10-24 | I__00134 bag+sandals labeled empty; I__00142 three fingers on camera not reported | Rule 10 expanded: human belongings and body parts (fingers/hand) → Human (count 1 if only parts/gear); never "no human or animal visible" |
| 2026-10-24 | I__00126–128 labeled Human though empty of people; I__00130 had 3 humans; I__00131 had 3 humans but "no animals"; I__00133–134 wrongly got 3 humans | Rule 10 (humans per frame); burst copy no longer propagates Human or empty-frame labels to followers; Human excluded as burst reconcile anchor |
| 2026-10-24 | I__00038 / I__00039 / I__00061 (and similar): ~¾ elephant leaving frame labeled "No animal detected"; I__00041 used partial unconfirmed phrase | Rule 8 tightened; new Rule 9 — partial/edge animals get best species guess + individual count |
