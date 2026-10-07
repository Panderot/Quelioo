# Quelio Design System

> **Product:** Quelio, an AI quiz generator (text, file, URL to quiz) plus a photo math solver, quiz songs, flashcards and audio lessons. **Tagline:** Questions that shine.
> **Audience:** Teachers, students, HR/training teams. Turkey + global (EN/TR/HYW).
> **Identity:** "Solar Paper": dark navy and amber sun on cream paper. No purple, no blue-violet gradients, no sparkle icon.

## 1. Design Principles

1. Calm and trustworthy: warm cream paper, soft warm borders, no visual noise.
2. One primary action per screen: the solid amber CTA is the hero; everything else is quieter (outline/ghost).
3. Editorial, not generic: Fraunces for headings.
4. Consistent rhythm: 4px spacing base, a small set of radii, one shadow language.
5. Bilingual-ready: Turkish/Armenian labels run ~30% longer; never set fixed pixel widths on text containers.

## 2. Brand

- **Logo mark:** bold "Q" ring; tail is a golden ray ending in a small sun disc with short rays. Bowl is cream on the navy sidebar, navy on paper. No container, no sparkle.
- **Wordmark:** "Quelio", Fraunces 600, 24px (`text-2xl`). **Tagline:** 12px semibold amber, under the wordmark on the sidebar.
- **Meaning:** Question + Helio (sun); the rising-sun ray is the brand motif.

## 3. Tokens

The Tailwind v4 `@theme` block in `src/index.css` is the authoritative source for colors and font stacks; this table explains usage.

| Token | Hex | Usage |
|---|---|---|
| `navy` | `#0E1330` | Sidebar, headings on paper, text on amber, toasts |
| `ink` | `#14172B` | Body text |
| `muted` | `#6B6F85` | Subtitles, helper text, placeholders |
| `amber` | `#F5A524` | Primary CTA, active nav bar, keyboard focus ring, fills, icons. Never small text (~2:1) |
| `amber-hover` | `#E0931A` | Hover/pressed for amber fills, borders, icons. Never small text |
| `amber-text` | `#9C4A09` | The only amber for small text: links, badges, labels, counters (>=4.5:1, also on `bg-amber/10-15`) |
| `paper` | `#FBF7EF` | Page background, sidebar text |
| `card` | `#FFFEFB` | Cards, input surfaces |
| `warm-border` | `#ECE5D6` | Card, input, divider borders |
| `focus-neutral` | `#D8CDB4` | Mouse/touch focus and hover border on controls (never amber) |
| `success` | `#1A7A4E` | Success states |
| `error` | `#C23A3A` | Error borders, text, tints (`bg-error/5`) |

- **Background:** flat `paper`. The only gradient is a 480px amber radial glow (8% opacity) at the top-right of the main column (`App.tsx`).
- **Contrast:** all text WCAG AA (>=4.5:1). Navy text on amber.
- **Fonts:** headings Fraunces Variable (soft optical, `@fontsource-variable/fraunces`), body/UI Plus Jakarta Sans (Google Fonts, 400-800). Both render Turkish glyphs. Noto Serif/Sans Armenian Variable are appended to `--font-serif`/`--font-sans` as hyw fallbacks.
- **Spacing:** 4px base (Tailwind scale).
- **Radius:** 8px (`boxed` select) · 10px (param selects, menu rows) · 12px `rounded-xl` (buttons, menus, chips-in-cards) · 14px (cards, panels, Generate) · 16px `rounded-2xl` (textarea, dropzones, file/URL cards, dialogs) · full (avatar, toggle, pills).
- **Shadow:** borders do most separation. Cards: none. CTA: `shadow-sm`, hover `shadow-lg shadow-amber/30`. Select/language menus: `0 16px 32px -12px rgba(20,23,43,.18), 0 4px 10px -4px rgba(20,23,43,.08)`. Dialogs, More menu, toasts, song panel: `shadow-lg`.

| Role | Size / line height | Weight | Font | Color |
|---|---|---|---|---|
| Page title (H1) | 24px, 30px at lg / 1.375 | 600, tight tracking | Fraunces | navy |
| Subtitle | 14px / 1.5 | 400 | Jakarta | muted |
| Eyebrow | 12px | 700, uppercase, wide tracking | Jakarta | muted |
| Field label | 11px | 700, uppercase | Jakarta | muted |
| Select value | 14px (`boxed` 12px) | 600 | Jakarta | ink |
| Nav item | 14px | 500 (active 600) | Jakarta | paper/60 (active paper) |
| Tab label | 14px | 600 (active 700) | Jakarta | muted (active ink) |
| CTA | 16px | 700 | Jakarta | navy on amber |

## 4. Layout

```
App root (flex, bg-paper)
├── Sidebar (navy; 256px / 72px icon rail at md / drawer below md)
└── Main column (flex 1, scrolls, amber radial glow top-right)
    ├── Top bar (h-20, flat)
    └── Content (max-w-5xl, padding 24 / 32 at lg / 40 at xl, space-y-7, 220ms fade-in)
```

| Breakpoint | Behavior |
|---|---|
| >= 1024px | Full 256px sidebar with labels |
| 768-1023px | Sidebar becomes a 72px icon rail (labels, wordmark, tagline hidden) |
| < 768px | Sidebar is a slide-over drawer (`bg-ink/40` scrim) behind a hamburger |
| < 640px | Parameter grid and action rows stack to one column / full width |

## 5. Shared components

- **Sidebar:** header logo + wordmark + tagline. Main nav: Create, Solve, Songs, Flashcards, Audio Lesson (headphones icon). Footer (pinned bottom, `border-paper/10`): Archive. Songs shows only when `GET /api/song` reports enabled (drawer included); while it is hidden, Flashcards and Audio Lesson move to the footer after Archive. Flashcards shows a small muted count of cards due today right of the label (hidden at 0 and in the icon rail; sr-only "N cards due today"). Nav item: no filled pill; inactive `paper/60` (icon `paper/40`), hover paper; active = 3px amber left bar + paper text + amber icon.
- **Top bar:** h-20, right-aligned; holds only the language switcher (plus the hamburger on the left below md).
- **Language switcher (`LanguageSwitcher`):** ghost button, globe + short code (EN/TR/ՀԱՅ) + chevron; listbox menu (card, warm border, radius 12, 240px) with native language names. Enter/Space/ArrowDown open, arrows move, Escape closes.
- **Tabs:** icon (16px) + label, bottom border; active 2px amber underline + bold ink (icon `amber-hover`); inactive muted, hover ink. WAI-ARIA tablist, Arrow/Home/End keys. Used on Create input and Archive.
- **Toggle:** one switch style (`h-6 w-11`): off warm-border track, on amber track, knob right. `role="switch"`, `aria-checked`, descriptive label. Study Mode is a button, not a toggle.
- **Ghost button (Clear Input):** card, 1px warm border, radius 12, muted text; hover `error/50` border + error text.
- **Outline buttons:** secondary actions (Copy, Print, Study, Check, Next step, etc.) are outline (warm border, or 2px navy border for the local "primary" outline); never solid amber unless it is the screen's primary.
- **Primary CTA (Generate / Solve):** full width, h-14, radius 14, solid amber, navy bold 16px, outline sun icon 20px (never sparkle). Hover `amber-hover` + 1px rise + glow. Loading: navy spinner + progress label. Generate has a muted time-estimate line above (`aria-describedby`), shown once input is valid.
- **Select (`Select`):** custom listbox for every parameter field, no native `<select>`.
  - Trigger always visible. `param`: h-11, radius 10, card, 16px side padding. `boxed`: radius 8, paper, 12px padding, 12px text. Value truncates; 14px chevron rotates 180° when open. Only border color changes between states.
  - Menu: portal-rendered, card, warm border, radius 12, 6px padding, width = trigger, max-height 280px, flips above when no room, 120ms fade + 4px slide.
  - Rows: min 40px, radius 10, 15px text; highlight `bg-amber/12`; selected semibold + amber check.
  - Disabled: same box, muted, not-allowed, out of tab order, `aria-disabled`.
  - WAI-ARIA listbox: arrows, Home/End, Enter/Space, Escape (returns focus), type-ahead; closes on outside click/Tab.
- **Output Language (`OutputLanguageSelect`):** same tokens, `boxed` trigger, 260px menu right-aligned and viewport-clamped. Auto-focused search; native names; "Suggested" (Auto, TR, EN, Western Armenian) + "All languages" groups, flat list while searching. Rows `dir="auto"`.
- **Menu (`MoreMenu`):** Select tokens as a WAI-ARIA menu (Enter/Space/ArrowDown open, arrows/Home/End, Escape returns focus); spans the button width below 640px.
- **Math text (`MathText`):** all model text; `$...$`/`$$...$$` via KaTeX (`trust: false`, `throwOnError: false`). Never `dangerouslySetInnerHTML` on raw model text.
- **Image crop step (`ImageCropStep`, lazy):** used for every photo upload; reports a normalized rect + rotation, the caller cuts from the full-res EXIF-oriented original (`imageNormalize.ts`, `imageCrop.ts`).
  - Whole photo visible (contain, max 70vh/60vh, upscale <=2x); outside dimmed `navy/45`. Box: 2px amber + L corners, drag/resize/pinch, min 48px; arrows move, Shift+arrows resize.
  - Rotate left/right, Reset; actions "Use this area" (2px navy outline) and "Use whole photo" (warm outline), stacked below 640px.
- **Undo toast:** fixed bottom-center navy pill (radius 12), paper text, amber "Undo"; auto-dismisses after 6s. Used for question, solution, song, card, deck and lesson deletes.
- **Inline delete confirm:** "Delete this ...?" + red-tinted Delete + outline Cancel before deleting.
- **Confirm dialog (`ConfirmDialog`):** modal (radius 16, scrim), focus starts on Cancel, Escape cancels, red-tinted confirm. Used for delete deck and reset progress.
- **Owner gate (`OwnerAccessGate`, production only):** card (radius 12, paper), password input, solid amber "Unlock", localized error. Shared by Songs and Audio Lesson; one stored code unlocks both. "Lock" (outline, lock icon) lives only on the owner page. Lists stay visible; only the step that leads to a paid call shows the gate.
- **Auth layout (`AuthLayout`):** public pages only (sign in/up, passwords, callback, legal). Paper background with the top-right glow; header h-20 with logo mark + wordmark (navy, left) and the language switcher (right); one centered card (`AuthCard`: radius 16, warm border, 24/32px padding, max 448px; legal text 672px). No sidebar.
- **Auth forms:** field = 11px bold uppercase muted label above an h-11 radius-10 input (card, warm border; error = red border + 12px red message with `role="alert"`, linked by `aria-describedby`). One solid amber CTA per card (h-12, radius 14, navy bold 16px, spinner while busy); secondary actions are outline buttons or amber-text links. Form-level messages: tinted rounded-xl line (`error` / `success` / neutral). Google is a full-width outline button (h-12) above an "or" divider and exists only when the project has the provider on.
- **Password strength hint:** three 4px bars under a new-password field (red weak, amber fair, green strong) plus a 12px muted line (`aria-live="polite"`). Only the 8-character minimum blocks; the rest is advice.
- **Check email:** card with title, the address, a spam note and an outline "Send again" button that counts down 60 s ("Send again in 42 s"); the same screen serves sign-up confirmation and password reset (it never says whether an account exists).
- **User menu (`UserMenu`):** last item of the sidebar footer: 32px amber initials avatar + name (name hidden in the icon rail). Opens an upward menu (MoreMenu tokens: card, warm border, radius 12, 40px rows) with Account and Sign out; WAI-ARIA menu keys. Works in the mobile drawer.
- **Sync status (`SyncStatus`):** muted pill left of the language switcher; hidden when every change is saved, "Saving…" with a spinner while writes wait, red-tinted "Couldn't save a change" when the server refused one.
- **Skeleton and load error (`DataStates`):** `SkeletonList` = rows of card/warm-border blocks with a 220ms pulse (off under reduced motion, `aria-busy`); `LoadError` = centered card with the message and an outline "Try again". Lists show the skeleton first and never an empty state before the load ends.
- **Rate-limit toast (`RateLimitNotice`):** the Undo toast shape (navy pill, bottom-center, 6s) saying "Too many requests, try again shortly"; any API call answered 429 raises it.

## 6. Create page

Column order: H1 + subtitle → draft-restore note → input card → eyebrow "Quiz Parameters" → parameters panel → Generate CTA → result.

- **Draft restore note:** muted row "Your draft was restored" + "Start fresh"; auto-dismisses.
- **Input card:** card, warm border, radius 14, padding 20/24.
  - Info row: left, the word-limit sentence then the counter ("Word count: N / 5,000"); right, Output Language label + select. Side by side at >=640px, stacked below.
  - Counter is muted (count medium weight); turns error only above 5,000, on any tab.
  - Then divider, Text/File/URL tabs, active input, footer with Clear Input.
- **Textarea:** card, radius 16, dashed warm border, solid on focus (focus color per §9); error border `error`. Over 5,000 words: "Only the first 5,000 words are used."
- **Focus selection (Text tab):** selection shows a floating amber-outline "Mark as focus" button (plus a text button below for touch). Marks are `bg-amber/30` in a mirrored backdrop behind a transparent textarea (identical layout classes). Removable chips below (max 5); overlaps merge; editing a mark drops it with a note.
- **File tab:** 2px dashed dropzone (radius 16; types + 10MB cap, "Browse files", privacy line). Extracting: spinner. Success: file card with trash, "Show/Hide preview", "Edit as text". Error: error-tinted dropzone + "Choose another file".
- **URL tab:** dashed input + solid amber "Fetch" (Enter too); spinner; success card with the same preview/edit controls; error-tinted card + "Try again".
- **Parameters panel:** one card (radius 14), per-cell hairline borders (never `divide-*`), 2 columns, 1 below 640px.
  - Order: Quiz title (full width) · Question Type / Question Count · Difficulty / MCQ Options Count · Answer explanations / Shuffle options · Hints (alone).
  - Field label 11px bold uppercase muted, 4px above the control.
  - Question types: MCQ, True or False, Fill in the Blanks, Short Answer, Matching, Open-ended, Mixed.
  - Question Count: first option and default "Auto (cover everything)" (as many questions as the facts need, max 30), then 3/5/10/15/20. Saved drafts keep their number. With Auto the estimate line reads "About N questions · This quiz takes …" (N guessed from the word count; hidden until there is text).
  - MCQ Options Count and Shuffle apply only to MCQ/Mixed; otherwise disabled in place with a muted helper, value kept.
  - Quiz title: optional, max 80, counter from 60; falls back to the generated title.
  - Answer explanations (default on): off skips explanations everywhere. Shuffle (default on): Fisher-Yates once after generation/regenerate, then stored. Hints (default on): off skips hints and hides the Hint button. None affect answer checking.

## 7. Quiz result and question cards

Shown below Generate after success (auto-scrolled), reused at `/archive/:id`.

- **Header card:** editable Fraunces title; meta: count • type • difficulty • language • "About N min". Action row: Study/Back-to-editing (Archive only), Show answers toggle (default off), outline Copy, Print/PDF, "Turn into a song". "View in Archive" (Create) / "Back to Archive" (Archive) top-right. Show answers never hides a question's own answer field.
- **Loading:** three pulsing skeleton cards (h-32, radius 14). **Error:** error-tinted card, localized message per code, "Try again". **Incomplete:** "X of Y questions were created." + "Create the rest". **Short source:** when the text supports fewer good questions than requested, a plain card (same border/radius/padding as the incomplete card, no button, hidden in print and study mode): "This text supports about {n} good questions."
- **Coverage line (`CoveragePanel`, quizzes with a facts plan only):** under the meta line, small muted text button "{n}/{m} key facts covered" (success check icon when complete). Click: an expandable `paper` section (radius 12, warm border, padding 12/16, eyebrow "Key facts") on desktop, a centered dialog (same as the print dialog) below 640px. One row per fact: status icon + topic label, right-aligned status text (Covered success / Partly covered amber-text / Missing error, "· edited" muted) and "Questions 1, 4" or "Not asked yet". Full fact statements (muted, xs) only with Show answers on; otherwise a muted note. Older quizzes show no line; never printed or copied.
- **Add questions for missing facts:** secondary outline button (warm border, navy bold xs, amber hover, spinner while adding) at the bottom of the panel, edit view only, when a fact is missing or partly covered. If the 30-question maximum leaves no room, a muted note says the questions go into a new quiz; the button then opens a new Archive entry "{title} · 2".
- **Question card:** card, radius 14. Header: amber number circle, amber-tinted type pill, Edit/Regenerate/Delete icon buttons with labels. Regenerating: spinner overlay.
- **Answer bar (`AnswerBar`):** fill-blanks input, short-answer textarea (2 rows), open-ended textarea (4 rows + counter); amber-outline square check button.
  - Result line `aria-live="polite"`, icon + text: "Correct!" (green), "Partly correct" (amber, short/open only), "Not yet. Try again." (red). AI feedback never reveals the answer.
  - Fill-blanks local only; short-answer local then `/api/grade`; open-ended `/api/grade`. Enter checks (open-ended: Ctrl/Cmd+Enter). State resets on edit/regenerate.
- **By type:** MCQ/true-false: native radio group + check (green/red tint + icon, correct option never revealed); Show answers adds a read-only amber-tinted correct answer. Fill-blanks: dashed-underline blank; answer in bold amber-text when shown. Short/open: "Model answer" paper box when shown. Matching (`MatchingColumns`): numbered left, lettered right shuffled via `getRightOrder()`, tolerant parsing (`1-A`, `1A`, `1=A`), per-item marks that never reveal letters.
- **Explanation:** "Show/Hide explanation" toggle, rendered only after the first check or with Show answers on.
- **Hint button (`HintControls`):** 36px square, warm border, muted, light bulb, left of the check button; only when the question has hints. "Hint" → "Another hint" → disabled "No more hints" (max 2). Hidden with Show answers or after a correct answer. Hints show numbered in an `amber/10` box (amber-text, `aria-live="polite"`).
- **Edit mode:** inline type-specific form, Save (solid amber) / Cancel (outline). Matching 3-6 pairs, no empty/duplicates, recomputes `rightOrder`. Fill/short: "Accepted answers" (up to 4); open-ended: required "Key points". All types: optional "Hint 1"/"Hint 2" (max 140), blocked if the leak check says a hint reveals the answer.
- **Print / PDF:** dialog "Question sheet" (default) / "With answer key"; sets `document.title` (restored on `afterprint`) and calls `window.print()`. One shared `[data-print-only]` layout: A4, 18mm margins, black on white, no fills/shadows, Jakarta 11pt / 1.45; header with meta + "Quelio" wordmark (sheet adds Name/Class/Date); `<ol>` with `break-inside: avoid` and ruled answer lines; answer key starts on a new page.

## 8. Other pages

### Solve (`/solve`)
- Title "Solve a math question" + subtitle. Same shell as Create.
- **Upload (`PhotoDropZone`):** dashed dropzone (click, drag-drop, paste, camera); any photo format, normalized to JPEG. Converting: spinner + status + "Cancel". Crop step always runs; then preview + "Change crop" / "Replace photo" + optional note.
- **CTA:** primary CTA "Solve", disabled until a crop is applied; loading adds a "Cancel" link (aborts silently).
- **Multiple problems:** card "Which problem should I solve?", one full-width outline row per problem (amber border on hover), outline "Crop the photo".
- **Result card (`SolutionView`):** amber-text uppercase topic, question, optional unnumbered intro, numbered steps (amber circle + navy text). Answer: `bg-amber/15` `w-fit` box aligned with step text, amber-text "Answer" label. Tip in a muted paper box. 0-2 common mistakes: `bg-amber/10`, `border-amber/40`, warning icon, amber-text label; hidden when none.
- **"Let me try first":** card row with switch above the result; stored in `quelio.solveTryFirst.v1` (try/catch). On: only topic/question/intro show, plus a progress line and "Next step" (2px navy outline) / "Show all" (warm outline). Answer comes last; focus moves to each newly revealed item (`tabIndex=-1`).
- **Explain this step:** amber-text light-bulb button per step (`aria-expanded`); paper box explanation, then "Even simpler" in an amber-tinted box; cached. Errors: red line + "Try again" (none for the hourly limit).
- **Error:** error-tinted card, localized message per code, "Try another photo".
- **Actions row:** max three outline actions: "Check my solution" (first), "Similar problem", "More" (→ "Solve another way", "Create a quiz on this topic", which prefills Create with MCQ/Medium, and "Make flashcards"). The same row appears in Archive > Solutions (shared `SolutionView`). Stacked full width below 640px.
- **Check my solution (`CheckWorkPanel`):** card, Fraunces heading + muted line, same photo pipeline (paste goes to this panel while open), outline "Check my work" (2px navy, spinner + "Reading your work..." + Cancel).
  - Read-confirm "Did I read your work correctly?": numbered line cards; low-confidence lines get a 2px dashed amber border + warning icon + "Hard to read". "Yes, check it" (navy outline), "Fix and check" (monospace textareas with live math preview, add/remove lines), "Retake photo". Only confirmed text is graded.
  - Results never rely on color alone: **Mistake** (2px error border + tint, X icon, error-type pill, explanation, "Corrected step" paper box; later steps muted), **Check this step again** (2px dashed amber, question-mark icon, neutral hint, never "wrong"), **Correct** (green check + text).
  - Summary box: green (correct), error (verified mistake), amber + question mark (check again / not sure), amber + warning (incomplete / different problem / unreadable); when unsure, a "Solution to compare with" box.
- **Similar problems (`SimilarProblems`):** numbered practice cards (paper, warm border): "Your answer" + "Check" (2px navy), live result line as in the answer bar, "Show solution" link. Outline "Another one" adds a problem.
- **Another way (`AnotherWayPanel`):** card, "Another way: {method}", steps + answer box, or a muted paper note when no different method exists. Cached.
- Explanations, check result, similar problems and the other method persist in the Solutions record. Save failure: one muted note.
- **Footer note:** small centered muted line framing Quelio as a learning tool.

### Archive (`/archive`)
- Title + subtitle, tabs "Quizzes" / "Solutions" (archive / calculator icons); active tab in the URL (`?tab=solutions`).
- **Quizzes:** one card list, hairline dividers, newest first. Row: title link (ink semibold, amber-text hover, music-note icon when the quiz has a song), meta (count • type • difficulty, "• N Options" for MCQ/Mixed, time estimate), locale date; outline "Study" button (book icon) → `/archive/:id?mode=study`. Empty: card + outline "Go to Create".
- **Solutions (`SolutionsList`):** full-text search above the same card list. Row: 56px thumbnail (calculator placeholder) · topic · math-aware preview · date · trash (inline confirm + undo toast). Empty: card + outline "Go to Solve".
- **Solution detail (`/archive/solutions/:id`):** Fraunces topic + date, "Back to Solutions", saved thumbnail (contain, max 50vh), then `SolutionView`. Unknown id: not-found card.
- **Quiz detail (`/archive/:id`):** the result view (§7) plus a "Listen" card (`SongListenSection`, players for this quiz's songs). Not found: card + "Back to Archive".
- **Study Mode:** opened by `?mode=study` or the header button; view-only, not persisted. Practice cards (no edit, no explanation toggle). After all are answered: "3 / 5 correct", muted "Hints used: N" if any, "Try again" resets.

### Turn into a song (`SongPanel`)
- Entry: outline button (music-note) in the result header; rendered only when `GET /api/song` reports enabled.
- Panel: right side on md+ (max 420px), bottom sheet on mobile (max 85vh, rounded top), scrim, `role="dialog"`, focus trapped, Escape/close return focus.
- **A, Options:** style chips + tone chips (Normal/Funny, default Normal). Chips: card/warm border; selected `bg-amber/15` + `border-amber` + amber-text. Length text "About N seconds" (scales with count, capped by provider). Outline "Write lyrics".
- **B, Lyrics:** coverage note, editable monospace textarea with section tags + counter (error over the limit), amber non-blocking fact-check warning, solid amber "Make the song" (re-checks edits first).
- **C, Creating:** pulsing music-note, rotating `aria-live` status, outline Cancel (back to B, no error).
- **D, Player (`SongPlayerCard`, shared):** optional "Demo sound" pill, custom controls + Download over a hidden `<audio>`, lyrics, muted AI disclosure, outline "Make another".
- Errors: localized message + "Try again"; daily limit notes. Save failure: muted note, song still plays.
- **Access gate:** `OwnerAccessGate` (§5) replaces step A until a valid code is stored.

### Songs (`/songs`)
- Same enabled switch as the song feature (redirects to Create when off). Header: title + subtitle, songs-left-today meta, outline "Lock" when a code is stored.
- **New song:** full-width solid amber button → inline Archive quiz picker (search, title + count rows) → embeds `SongPanel`; empty Archive shows "Go to Create".
- **Filters:** All/Normal/Funny chips (song chip style) + title search.
- **Generating row:** pulsing row while creating; `beforeunload` warns on leave.
- **List:** divided card. Row: title, style • tone • length • date, solid amber play/pause circle (one at a time), outline "View/Hide lyrics", "Download", "Open quiz" (or muted "Quiz deleted"), trash with inline confirm + undo toast.
- **Empty:** archive icon, "No songs yet", solid amber "New song".

### Flashcards (`/flashcards`, `/flashcards/:deckId`, `/flashcards/:deckId/study`)
- **Deck list:** title + subtitle, solid amber "New deck" (the screen's primary). Search box, then one divided card list sorted by due count. Row: 48px progress ring (amber arc on warm-border track, mastered = box >= 4), name link, muted "N cards · M learned · K due today", "Study · K" (2px navy outline when K > 0, warm outline otherwise) and outline "Edit"; buttons go full width below 640px. Empty: cards icon, "New deck" (navy outline) and "Add sample decks" (warm outline, only while no sample deck exists).
- **Deck editor:** back link, Fraunces deck name, Study button. Settings card: name (max 80), description (max 160), "New cards per day" (`Select`). Outline action row: Paste many cards, Export CSV, Import CSV, Reset progress, Delete deck (error text, right-aligned on >= 640px). Fields autosave (400ms debounce, flush on blur). Card rows: "Card N", amber "Box N" pill, trash; front/back textareas side by side from md. Duplicate fronts get an error border + error line; empty-side cards a muted "skipped when studying" note.
- **Bulk paste:** mono textarea, live preview list (line number, front, back); invalid lines `bg-error/5` + error text with the reason; duplicates flagged in amber-text; "Add N cards" (navy outline).
- **Generate cards with AI (`CardGeneratorPanel`):** card (radius 14) with a Fraunces heading, Text / Topic tabs (Create tab style). Text: paste textarea + word counter (30-5,000 words). Topic: input (max 120, counter) + Level select (General, LGS, YKS, KPSS, YDS, University). Options in a 3-column grid (1 column below 640px): Number of cards (5-30, default 10), Card style, Output language (`OutputLanguageSelect`). Generate is solid amber with the sun icon only in an empty deck (the screen's primary); otherwise a 2px navy outline without the sun, opened from an outline "Generate cards with AI" button in the action row. Loading: spinner + "Generating cards..." + a Cancel link; Generate stays disabled. Errors: error-tinted box (`role="alert"`) + "Try again" (none for the hourly limit); nothing is added.
- **Review list:** "Review the cards" + muted help (and "N doubtful cards were removed" after a topic fact check); one row per card: checkbox (all checked, unchecked rows dim to 60%), editable front/back textareas, duplicates of deck fronts get an error border + line. "Add N cards" (navy outline) and "Discard". Nothing is saved before "Add".
- **Cards from a quiz, a solution or mistakes:** quiz result view (Create and `/archive/:id`) gets a "More" menu (`MoreMenu`) at the end of its action row: "Turn into flashcards" and, once a question was answered wrong on its first check, "Flashcards from my mistakes (n)" (also as a navy-outline button in the Study Mode score card). Solve's "Make flashcards" lives in its More menu (Solve section).
- **Add-cards dialog (`AddCardsDialog`):** modal (radius 16, max 672px wide, scrolls inside at 88vh, scrim, Escape/close return focus). AI source: spinner + "Generating cards..." + Cancel, errors as in the generator. Then the shared review list (`CardReviewList`), a destination radio pair ("New deck" with an editable name defaulting to the quiz title / solution topic, or "Existing deck" with a `Select` of decks) and solid amber "Add N cards". Converting the same quiz/solution again shows an amber-tinted note with "Add only the N missing cards there" (navy outline). Done: green line "Added N cards to “deck”" + "Open deck" (navy outline) and "Close".
- **Mistakes deck:** "{quiz title} · Mistakes" (localized), created in one click without review; its daily new-card limit covers all mistakes so every card is due today. A green status line under the action row says what was added and links to the deck; repeating it only adds missing cards.
- **Due reminder (`DueReminder`):** first line of Create and Solve when cards are due: small card (radius 12, warm border), muted 12px link "N flashcards are waiting for you today" to `/flashcards`, and a close icon ("Hide until tomorrow", stored per local day in `quelio.flashcardsReminder.v1`).
- **Study:** back link "Exit study", deck name, "i / n" and progress dots (8px; green known, red missed, amber current with ring, warm-border upcoming; wrap). Card: a real button, 320px (360px at md), radius 16, CSS 3D flip (450ms, hidden backfaces); front Fraunces navy, back has a 2px `amber/60` border; long text scrolls inside; math via `MathText`. Reduced motion: 200ms crossfade, no rotation.
- Before flipping a muted hint ("Click the card or press Space" / touch: "Tap ... swipe right/left"); after flipping two 48px buttons: outline "Don't know" (error text) and solid amber "Know", each with a small `kbd` hint. Keyboard hints and the shortcut line are hidden on coarse pointers. Touch: swipe after flipping (>= 60px), the card follows the finger.
- **All done:** card with "All done for today", "Next review: …", navy-outline "Practice anyway" and a muted note that practice never changes the schedule; practice sessions show an amber "Practice" pill.
- **Summary:** 112px ring with known/total, "You knew X of Y", list of cards to repeat, next review line, solid amber "Study again" (only when something is due) and outline "Back to decks".

### Audio Lesson (`/lessons`, `/lessons/:id`)
- **Owner gate:** `OwnerAccessGate` (§5) before planning, writing or recording.
- **Owner page (`/owner`, no navigation link):** the only place with money. Fraunces title "Owner", muted subtitle, then (production: after the owner gate) a card with "This month: $x" (or "of $budget"), one divided row per lesson with its total cost, and the outline "Lock" button. Without a code it shows only the `OwnerAccessGate`.
- **List page:** title + subtitle, full-width solid amber "New lesson" (headphones icon). Search box, then one divided card list, newest first. Row: title link, muted source ("Archive quiz: …"), muted "N episodes · about 6 min each • style • date", status pill (`bg-amber/15` amber-text "Script ready", green tint "Audio ready"), outline "Open", trash with inline confirm + undo toast. Empty: headphones icon, "No lessons yet", small solid amber "New lesson".
- **New lesson (`NewLessonPanel`):** card (radius 14) replacing the button. "Or start from:" chips "From an Archive quiz" / "From a saved solution" open an inline picker (paper, search, rows); a picked source fills the Text tab with a "Using: …" note + "Use my own text". Then Create's `InputCard` (focus marking off, "per lesson" limit line) and "Lesson options": the parameters-panel look (11px uppercase labels, hairline cells): Length (fixed text "About 6 minutes per episode"), Style chips (Two hosts talking default, Teacher and student, Single narrator; song chip style, `role="radio"`), Level `Select` (General, LGS, YKS, KPSS, University), Tone chips (Normal, Fun + muted safety note). Output language lives in the input card. Primary CTA "Plan the lesson" (sun icon, spinner + "Finding the key points..." + Cancel link).
- **Plan card:** paper box: eyebrow "Lesson plan", Fraunces "This text will be one episode of about N minutes" / "…a N-episode series", amber-text toggle "N key points" (list grouped by part), on-demand note (no cost line anywhere: students never see money). Same source + options already made: amber-tinted row with solid amber "Open it" (the primary), then "Write a new one anyway" becomes a 2px navy outline. Otherwise solid amber "Write the lesson" / "Write part 1" + outline "Change options". Writing: spinner, "Writing and fact-checking…", Cancel; `beforeunload` warns.
- **Lesson page:** "Back to lessons", Fraunces title, muted style • level • tone • episodes. Series: Create-style tabs "Part N" (unwritten: muted "· not written"). Unwritten part: card with the on-demand explanation + solid amber "Prepare part N".
- **Summary card:** eyebrow "Part N of M", Fraunces episode title, muted "About 2:13 · 190 words" (the estimate), replaced by the file's real "2:19 · 190 words" once audio exists (same number as the player and the list row); amber-text toggle "n/m key points covered" opening every key point with "Taught in: part · section" (dim when it belongs to another part). Check status: green check line when passed; otherwise amber-tinted box with a warning icon (lines to check / check could not run / edits pending) and the missing key points. Muted "The fact-checker rewrote N lines." Pending edits: 2px navy outline "Check my edits".
- **Approve + voice step (`LessonAudio`):** below the summary, a card "Approve the script and choose voices" (solid amber); audio is only recorded for an approved script. Then a "Voices" card: per speaker an 11px uppercase label, a `Select` of TTS voices and a 44px outline speaker-icon button that plays a static preview (no API call); muted line "About m:ss of audio. N lines will be recorded."; solid amber "Record audio" (mic icon).
- **Recording progress:** spinner + "Recording 12 / 48 lines" (`role="status"`), 8px amber progress bar on a warm-border track, Cancel link. Finished lines are saved as they arrive; after a reload or an error the card says "N of M lines are recorded and saved." and the button becomes "Update audio (K lines)". Errors: error-tinted box with the localized message and "Try again" (none for daily cap / budget). After an edit, only changed lines are listed and recorded again.
- **Player (`LessonPlayer`):** card: 48px amber play/pause circle, one range seek bar across the whole lesson (amber accent) with "m:ss / m:ss", outline "Back 10 s" / "Forward 10 s", speed pills 0.75-1.5× (song chip style), outline "Download MP3" and "Download transcript", muted shortcut line. One joined MP3 in a single hidden `<audio>` (gapless; pause lines followed by 2.5 s of silence), Media Session metadata and seek actions. Space plays/pauses, arrows skip 10 s (not while typing). Only one audio plays at a time app-wide.
- **Transcript:** section headings (role label + Fraunces title), each line a button (speaker label + text) that jumps there; the current line is `bg-amber/15` and scrolls into view while playing. Self-check answers show a muted italic "Think first, then show the answer." + outline "Show answer". With audio ready, the editor hides behind an outline "Edit the script" toggle; the owner-only spelled-out abbreviations list sits under the player. No money is shown on the list or lesson pages.
- **Script editor (`ScriptEditor`):** sections with an amber-text uppercase role label (Quick recall, Opening, Lesson, In simple words, Recap, Self-check, Study tip) + Fraunces section title. Line card (radius 12, warm border): 11px uppercase speaker label, small "pause" / "edited" pills, text; flagged line: 2px dashed amber border + warning icon + "Check this line:" reason. Icon buttons (32px): move up/down, edit, add after, delete; below 640px they sit in a row under the text. Edit: speaker `Select` (boxed, two-speaker styles), textarea, solid amber "Save" + outline "Cancel"; a new line exists only once saved with text. Below the script: 2px navy outline "Prepare next part (N)" or outline "Go to part N".

### Sign in, sign up, passwords (`/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password`, `/auth/callback`)

All inside `AuthLayout`. Sign in: title, subtitle, optional Google, email, password, "Forgot your password?" link right-aligned, amber CTA, "Create an account" link. Sign up adds an optional name, the strength hint and a required checkbox (20px, amber) "I accept the Terms of Use and the Privacy Notice" with both links opening the legal pages. After sign-in the user returns to `?next=` (only same-site paths). The callback shows a splash while it verifies the link; an expired or invalid link gets a card with "Get a new link". Every error is generic: nothing says whether an email is registered.

### Legal (`/kullanim-sartlari`, `/gizlilik`)

Public, wide `AuthCard`. A tinted amber "Draft" note comes first (final legal text is supplied by the owner), then short sections (serif 18px heading, 14px body) and a text "Back" link.

### Account (`/account`)

Page intro, then stacked cards (radius 14, warm border, 20px padding, serif 18px title, optional muted hint): Profile (name field + save, interface language Select), Email (current address, new address, confirmation sent note), Password (new + confirm with strength hint), Sign-in methods (rows: email, Google), Sessions (outline Sign out, Sign out of all devices), Your data (Download my data), Data on this device (only when old local data exists; amber CTA opens the import dialog), Delete account (red-tinted button). Delete opens a dialog with a typed-email confirmation; the red confirm unlocks only on a match.

### Import dialog (`ImportDialog`)

ConfirmDialog shell (radius 16, scrim, max 448px). Prompt: serif title, "Found 8 decks, 23 quizzes and 4 songs on this device. Add them to your account?", a paper list of counts, a muted card total and "nothing is deleted until the import is checked"; outline "Not now" + amber "Import". Running: status line per step and a 8px amber progress bar. Result: green-neutral "Imported" (or a red message when unchecked or failed, with Try again), a muted skipped-duplicates line, then "Remove old copy" (red tint) or "Keep it". Shown once per account per device; "Not now" leaves the Account entry.

## 9. Interaction, motion, accessibility

- **Focus:** driven by input modality (`src/lib/focusModality.ts`, `:root.modality-mouse` / `.modality-keyboard`), not `:focus-visible`. Mouse/touch: only a 1px `focus-neutral` border (error border if invalid). Keyboard: one 2px amber outline, 2px offset. Never both; open select triggers show no ring.
- Transitions 150-200ms ease-out; content fade-in 220ms (opacity + 4px). Hover lift only on the CTA. `prefers-reduced-motion` collapses animations/transitions.
- Icons: outline, ~1.75-2px stroke, rounded; 16px in nav/tabs/buttons, 20px CTA sun. The sun (circle + 8 rays) appears only on the CTA. Every icon has visible text or `aria-label`.
- Touch targets >= 40x40px. Tabs, switches, listboxes and menus follow WAI-ARIA patterns (above).

## 10. Content & Voice

- Clear, warm, no hype. Labels start with a verb ("Generate Quiz", "Solve", "Clear Input"). Thousands separators (5,000).
- Every string comes from `en`/`tr`/`hyw` i18n files (e.g. `hero.title`, `cta.generate`, `params.eyebrow`).
- Never ship a control with no real behavior (no placeholder Logout/Account/Upgrade).

## 11. Do and Don't

- Do use amber for the primary CTA, active nav, focus and soft tints; use `amber-text` for any amber small text.
- Do separate with borders and whitespace; keep shadows soft. Fraunces for headings only.
- Do keep sidebar labels short (max 2 words in EN).
- Don't add promos, founder lines or cross-app banners.
- Don't reintroduce indigo/violet, a blue background, the sparkle icon, or any gradient besides the top-right glow.
- Don't set fixed pixel widths on text containers.

New screens reuse these tokens and components; add new components here before using them.
