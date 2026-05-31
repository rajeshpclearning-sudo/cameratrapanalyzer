# Test fixtures

- `I__00078.png` — sample elephant camera-trap frame (from user upload).
- Run analysis: `npx tsx --env-file=.env.local scripts/test-single-image.ts test-fixtures/I__00078.png`
- Output: `last-analysis.csv` (open in Excel).

Use the **original `.JPG` from the trap** if you need EXIF date/time; PNG exports often have no EXIF (overlay text is not read).
