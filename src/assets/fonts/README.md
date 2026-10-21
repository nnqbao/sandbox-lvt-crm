# Noto Sans Regular — attendance PDF font

- **Family:** Noto Sans
- **File:** `NotoSans-Regular.ttf` (static Regular TrueType)
- **Upstream:** https://github.com/notofonts/noto-fonts
- **Upstream path:** `hinted/ttf/NotoSans/NotoSans-Regular.ttf`
- **License:** SIL Open Font License 1.1 — see `OFL.txt`
- **Vendored:** 2026-08-23
- **Size:** 556 KiB TTF

jsPDF can embed TrueType bytes via `addFileToVFS` / `addFont`. This file is loaded from disk in tests and inlined by Vite at build time into the attendance-PDF chunk (not fetched from a CDN, system font, or runtime network).

`@fontsource-variable/montserrat` in this app is WOFF2-only and is **not** used for PDF generation.

# Tinos Regular / Bold — Lịch công tác chung PDF font

- **Family:** Tinos (metric-compatible with Times New Roman)
- **Files:** `Tinos-Regular.ttf`, `Tinos-Bold.ttf` (static TrueType, includes the `vietnamese` subset)
- **Upstream:** https://github.com/google/fonts (`ofl/tinos/`, source repo https://github.com/googlefonts/tinos @ `3b4482a99b80ea5fc75f187b1be3120a3f5905b3`)
- **License:** SIL Open Font License 1.1 — see `Tinos-OFL.txt` (Google Fonts now ships Tinos under OFL; older releases were Apache 2.0)
- **Vendored:** 2026-10-21
- **Size:** 509 KiB (Regular) + 584 KiB (Bold)

Used **only** by the shared duty schedule PDF (`src/duties/sharedDutySchedulePdf.js`) so the PDF matches the Times New Roman Word template (see `DESIGN.md` §2). Loaded from disk on the server (`src/duties/sharedDutyScheduleFont.js`) and inlined by Vite into the lazily loaded PDF chunk in the browser. Homeroom PDFs keep Noto Sans.
