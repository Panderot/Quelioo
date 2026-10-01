# Quelio Design System

> **Product:** Quelio, an AI quiz generator (text, file, URL, YouTube, image, PDF, video to quiz)
> **Tagline:** Questions that shine.
> **Audience:** Teachers, students, HR/training teams. Turkey + global (EN/TR).
> **Identity:** "Solar Paper" — dark navy and amber sun on cream paper. No purple, no blue-violet gradients, no sparkle icon.

## 1. Design Principles

1. Calm and trustworthy — warm cream paper, soft warm borders, no visual noise.
2. One primary action per screen — the solid amber CTA is the hero; everything else is quieter.
3. Editorial, not generic — Fraunces for headings, not the default AI-tool look.
4. Consistent rhythm — 4px spacing base, a small set of radii, one shadow language.
5. Bilingual-ready — layouts survive longer Turkish/Armenian labels (~30% longer than English); never set fixed pixel widths on text containers.

## 2. Brand

| Element | Spec |
|---|---|
| Logo mark | Bold "Q" ring; tail is a golden ray ending in a small sun disc with short rays. Bowl color adapts: cream on navy sidebar, navy on light/paper backgrounds. No container, no sparkle. |
| Wordmark | "Quelio", Fraunces, weight 600, ~24px |
| Tagline | "Questions that shine.", ~12px semibold amber, under the wordmark on the navy sidebar |
| Meaning | Question + Helio (sun) — the rising-sun ray is the brand motif |

## 3. Color

| Token | Hex | Usage |
|---|---|---|
| `--color-navy` | `#0E1330` | Sidebar background, avatar background, headline text on paper |
| `--color-ink` | `#14172B` | Body text |
| `--color-muted` | `#6B6F85` | Subtitles, helper text, placeholders |
| `--color-amber` | `#F5A524` | Primary CTA, active nav marker, focus accents, progress bar |
| `--color-amber-hover` | `#E0931A` | Hover/pressed state for amber elements, links |
| `--color-ember` | `#FF7A2F` | Tiny highlights only — never large areas |
| `--color-paper` | `#FBF7EF` | Page/main background, sidebar text |
| `--color-card` | `#FFFEFB` | Cards, input surfaces |
| `--color-warm-border` | `#ECE5D6` | Card, input and divider borders |
| `--color-focus-neutral` | `#D8CDB4` | Mouse/touch focus border on form controls and dropdown triggers (never amber) |
| `--color-success` | `#1F8A5B` | Success states |
| `--color-error` | `#D64545` | Error borders and helper text |

- Page/main background is flat `--color-paper`. No gradients on backgrounds or buttons except one soft accent: a radial glow, amber at ~8% opacity, top-right of the main content area:
  ```css
  background: radial-gradient(circle, rgba(245, 165, 36, 0.08) 0%, rgba(245, 165, 36, 0) 70%);
  ```
- All text keeps WCAG AA contrast. Navy text on amber is required for the CTA.

## 4. Typography

- **Headings (H1, page-level):** `Fraunces Variable` (soft optical), weight 600, tight tracking. npm `@fontsource-variable/fraunces`, imported in `src/index.css`.
- **Body/UI:** `Plus Jakarta Sans`, Google Fonts, weights 400–800.
- Both must render Turkish glyphs correctly (İ ı ğ ş ç ö ü).
- **Armenian fallback (hyw):** neither face has Armenian glyphs, so `Noto Serif Armenian Variable` / `Noto Sans Armenian Variable` (`@fontsource-variable/noto-serif-armenian` / `-noto-sans-armenian`) are appended to the `--font-serif` / `--font-sans` stacks. Latin text is unaffected.

| Role | Size / Line height | Weight | Font | Color |
|---|---|---|---|---|
| Page title (H1) | 24–30px / 1.3 | 600 | Fraunces | navy |
| Subtitle | 14px / 1.5 | 400 | Plus Jakarta Sans | muted |
| Eyebrow / section label | 11–12px / 1 | 700 | Plus Jakarta Sans | muted, uppercase, tracking 0.05–0.08em |
| Field label (parameters) | 11px / 1 | 700 | Plus Jakarta Sans | muted, uppercase |
| Input / select value | 14–15px / 1.4 | 500–600 | Plus Jakarta Sans | ink |
| Nav item | 14px / 1 | 500 (active 600) | Plus Jakarta Sans | paper/60% (active: full paper) |
| Tab label | 14px / 1 | 500 (active bold) | Plus Jakarta Sans | muted (active: ink) |
| Button (hero) | 16px / 1 | 700 | Plus Jakarta Sans | navy (on amber) |

## 5. Spacing, Radius, Shadow

- **Spacing (4px base):** `4, 8, 12, 16, 20, 24, 32, 40, 48` px.
- **Radius:** small 10px (parameter selects) · medium 14px (input card, panels, Generate button) · large 16–24px (reserved) · full 9999px (avatar, toggle).
- **Shadow:** borders (`--color-warm-border`) do most separation work; shadows stay soft.
  ```css
  --shadow-card: 0 1px 2px rgba(14, 19, 48, 0.04);
  --shadow-cta-hover: 0 8px 20px rgba(245, 165, 36, 0.30);
  ```

## 6. Layout

**App shell** (full-bleed, no floating window):
```
App root (flex, bg-paper)
├── Sidebar (navy, fixed width 256px / icon rail 72px / drawer below 768px)
└── Main column (flex 1, bg-paper, subtle top-right amber radial glow)
    ├── Top bar (flat, height 80px, no heavy border)
    └── Content (padding 24–40px, max-width 5xl column, fade-in on mount)
```

**Content column order (Create page):** H1 (Fraunces) + subtitle → Input card → eyebrow "QUIZ PARAMETERS" → single parameters panel (2 columns, hairline dividers) → full-width Generate Quiz button (height 56, radius 14, solid amber).

**Responsive:**

| Breakpoint | Behavior |
|---|---|
| ≥ 1280px | Full layout |
| 1024–1279px | Sidebar stays; content padding 32px |
| 768–1023px | Sidebar collapses to icon-only rail (72px), labels hidden |
| < 768px | Sidebar becomes a slide-over drawer behind a hamburger; parameter grid becomes 1 column |

## 7. Components

### 7.1 Sidebar
Width 256px (72px icon rail at md, drawer below 768px), `--color-navy` background, `--color-paper` text. Header: logo + Fraunces wordmark + amber tagline. Main nav: Create, then Solve. Nav item: no filled active pill — default `paper/60`, hover `paper`; active = 3px amber left bar + full-opacity paper text + amber icon. Footer group (Archive) pinned to bottom, top border `paper/10`, routes to `/archive`.

### 7.2 Top bar
Height 80px, flat, flex, content right-aligned (mobile menu button is the only left-side element, < 768px only). Holds the language switcher only.
- **Language switcher:** ghost button — globe icon + short code (EN/TR/ՀԱՅ) + chevron — opens a listbox (card surface, warm border, radius 12) with each language in its native name. Full keyboard support (Enter/Space/ArrowDown opens, arrows move, Escape closes).

### 7.3 Input card
Card surface, 1px warm border, radius 14, padding 20–24. Info row: word-limit line (30–5,000 words) + word count (left), Output Language select (right). Divider, then Text/File/URL tabs, then the active tab's input, then a footer row with a Clear Input ghost button (7.6).

### 7.4 Tabs
Row with 16px icon + label, bottom border. Active: ink bold text + 2px amber underline. Inactive: muted, hover ink.

### 7.5 Textarea / File / URL inputs
- Background `--color-card`, **dashed** warm border by default, **solid amber** + soft amber ring on focus. Error: border/ring `--color-error`. Truncation note under the input when capped at 5,000 words: "Only the first 5,000 words are used."
- **File tab:** empty state is a dashed dropzone (icon, drag/drop hint, accepted types + 10MB cap, "Browse files" button, privacy line — extraction is client-side: pdfjs-dist for PDF, mammoth for DOCX, plain read for TXT/MD, all lazy-loaded). Extracting: centered spinner + "Reading your file...". Success: file chip (card surface, radius 16) with name/meta, a trash icon, a "Show/Hide preview" toggle, an "Edit as text" link. Error: error-tinted dropzone with a localized message (unsupported type, too large, password-protected/scanned PDF, corrupt/empty, not enough text) + "Choose another file".
- **URL tab:** idle — dashed input + solid-amber "Fetch" button (Enter also fetches). Fetching — spinner + "Fetching the page...". Success — result card (check icon, title/URL, word count, same truncation note, same preview/edit-as-text controls). Error — error-tinted card with a localized message (invalid/blocked/unreachable/timeout/not HTML/no article text/YouTube unsupported/too many redirects) + "Try again".
- **Focus selection (Text tab only):** selecting text in the textarea shows a small floating amber-outline "Mark as focus" button above the selection, plus a same-action secondary text button under the textarea for touch. Marked parts render as a soft amber highlight (`bg-amber/30`) via a mirrored backdrop layer sitting behind a transparent textarea (identical box/font/padding classes on both layers so text lines up while typing/wrapping/scrolling, RTL and Armenian included). Below the textarea, marked parts list as removable chips (short preview + x), capped at 5 with a localized limit note; overlapping selections merge. Editing text away from a marked part drops that focus part with a short localized note. Draft restore, Clear Input and "Edit as text" (file/URL → Text tab) all carry focus parts along consistently.
- **Draft restore note:** on opening Create with a saved draft, a muted card row above the input area reads "Your draft was restored" with a "Start fresh" action that clears the draft and resets the form; auto-dismisses after a few seconds.

### 7.6 Ghost button (Clear Input)
Card surface, 1px warm border, radius 12, muted text; hover shifts border/text to error tone.

### 7.7 Toggle (Study Mode, Show answers)
One switch style everywhere a binary control is needed. Off = warm-border track, card-colored knob; on = amber track, knob right. `role="switch"`, `aria-checked`, descriptive `aria-label`.

### 7.8 Parameters panel
One card (warm border, radius 14): quiz title (full width) · Question Type / Question Count · Difficulty / MCQ Options Count · Answer explanations switch / Shuffle options switch · Hints switch alone (2-plus-1 layout — its row's second column stays empty), hairline dividers between cells (single column below 640px, same order; borders are per-cell, never a `divide-*` utility, so a border only ever meets a real neighboring edge). Field label: 11px bold uppercase muted, 4px above the trigger. Question Type options, in order: MCQ, True or False, Fill in the Blanks, Short Answer, Matching, Open-ended, Mixed. MCQ Options Count and Shuffle options both only apply to MCQ/Mixed — otherwise stay in place but disabled (7.10/7.7) with a muted helper line; last chosen value is preserved. Quiz title is optional (max 80 chars, counter from 60), same field style as the dropdowns; falls back to the generator's own title when empty, stays editable in the result view. Answer explanations defaults on; off skips explanation generation/UI everywhere (result view, Archive, Study Mode, Copy, Print) without affecting answer checking. Shuffle options defaults on; shuffles MCQ option order (Fisher-Yates, correct answers spread across positions) once after generation/regenerate, then the order is stored and never re-shuffled on render. Hints defaults on; off skips hint generation and hides the Hint button everywhere for that quiz (7.15/7.17) without affecting answer checking.

### 7.9 Primary CTA (Generate Quiz)
Full width, height 56px, radius 14, solid amber, navy bold text, no gradient. Icon: outline sun (circle + short rays), never a sparkle. Hover: `amber-hover` + 1px rise + soft amber glow. Active: returns to rest. Loading: navy spinner replaces the icon, label "Generating your quiz...". A muted clock-icon line above the button shows a pre-generation time estimate ("about X-Y minutes", or a single value/"less than a minute"), tied to the button via `aria-describedby`; hidden until input is valid.

### 7.10 Select / dropdown
One custom listbox component for every choice field (parameter selects, Output Language, language switcher) — no native `<select>`.
- **Trigger:** always visible at rest (never appears/disappears by state). `param` variant: 1px warm border, radius 10px, card background, height 44px, 16px left padding, chevron 16px from the right, ≥44px reserved before it. `boxed` variant (Output Language, compact): radius 8px, paper background, 12px left padding, chevron 12px from the right, ≥36px reserved. Value truncates before the chevron; chevron rotates 180° when open. Border width/padding never change — only border color.
- **Menu:** card background, 1px warm border, radius 12, soft shadow, 6px inner padding, portal-rendered (never clipped), width matches trigger, max-height ~280px with a thin scrollbar, opens below (flips above when no room).
- **Rows:** min 40px, radius 10px, 15px text. Hover/keyboard-highlight: ~12% amber tint (never native/blue). Selected: semibold + amber check icon.
- **States:** rest border `warm-border`; hover/mouse-focus/open all use `#D8CDB4` (1px, no ring). Keyboard `:focus-visible` adds a single 2px amber ring, 2px offset, instead.
- **Disabled:** same visible box, muted value/chevron, not-allowed cursor, not reachable by Tab, `aria-disabled="true"`.
- **Motion:** 120ms fade + 4px slide; respects `prefers-reduced-motion`.
- **Keyboard:** WAI-ARIA listbox — trigger `aria-haspopup="listbox"`/`aria-expanded`/`aria-labelledby`/`aria-activedescendant`; menu `role="listbox"` + `role="option"` rows. Arrows move highlight, Home/End jump ends, Enter/Space selects, Escape closes (returns focus), type-ahead jumps to a label. Closes on outside click/Escape/Tab/selection.
- **Output Language variant** (searchable/grouped, separate component, same visual tokens as above, `boxed` trigger, fixed 260px menu, right-edge-aligned and viewport-clamped): a search input pinned at top, auto-focused; languages always shown by native name (except localized "Auto"). Empty search: grouped under "Suggested" (Auto, Turkish, English, Western Armenian) and "All languages" (rest, alphabetized by English name); while searching, groups hide and results are a flat list, empty state shows "No languages found". Rows carry `dir="auto"` for RTL scripts. Arrows/Enter operate on the currently visible rows; typing goes into the search field.

### 7.11 Solve page
Same shell as Create. Page title "Solve a math question" + subtitle.
- **Upload area:** input-card surface; empty state is the same dashed dropzone as 7.5 (click, drag-drop, paste, mobile camera capture). Once chosen: preview image (rounded, bordered, `object-contain`, max height ~360px) + "Change photo" link.
- **Primary CTA:** same style as 7.9, label "Solve", disabled until a photo is chosen; loading swaps icon for spinner and label for "Solving...".
- **Result card:** amber-hover uppercase topic label, question, then numbered steps (amber circular badge + navy text). Final answer as an inline amber-tinted chip (`bg-amber/15`) with an "Answer" label; tip below in a muted paper box. All model text renders through the math-aware text component (7.12).
- **Demo notice:** shown above the result when the response is a fallback sample (no API key configured) — muted amber banner (`border-amber/30`, `bg-amber/10`, amber-hover bold text). Solve keeps its own always-available demo fallback; this does not apply to Create (7.14).
- **Error state:** error-tinted card, localized message per error code, "Try another photo" button.
- **Secondary action:** outline "Create a quiz on this topic" button (never solid amber) navigating to Create with topic/question/steps/answer prefilled (MCQ, Medium).
- **Footer note:** small centered muted line framing Quelio as a learning tool, not an answer-copying shortcut.

### 7.12 Math text rendering
Model output mixes plain text with LaTeX (`$...$` inline, `$$...$$` block). A shared component splits text/math segments and renders math via KaTeX (`trust: false`, `throwOnError: false`) — never `dangerouslySetInnerHTML` on raw model text, only on KaTeX's own generated markup.

### 7.13 Archive page
Same shell as Create. Title "Archive" + subtitle.
- **List:** single column, newest first, one card container with hairline dividers between rows (not separate cards).
- **Row:** title links to `/archive/:id` (ink, semibold, truncates, amber-hover); meta line (question count • type • difficulty, + "• N Options" for MCQ/Mixed only, + time estimate); created date/time for the active locale; Study Mode toggle pinned right, outside the link (7.7).
- **Empty state:** centered card (archive icon, "No quizzes yet" title, subtitle) + one outline "Go to Create" button (never solid amber).
- Entries with no valid `quiz.questions` array are dropped silently on load (migrated once) — there is no separate "legacy entry" UI state.

### 7.14 Quiz result view (Create page, and Archive detail when Study Mode is off)
Shown below Generate on Create after success (auto-scrolled into view), reused unchanged at `/archive/:id`. Same shell column, not a modal.
- **Header:** card surface (warm border, radius 14). Editable title in Fraunces (pencil toggles inline input + Save/Cancel) + meta line (question count • type • difficulty • output language, native name or localized "Auto" • "About N min" time estimate, AI-assisted per-question values summed, updates on regenerate/delete/undo). Hairline divider, then action row: Study Mode toggle (Archive detail only, 7.17), Show answers toggle (7.7, off by default), then outline Copy and Print/PDF buttons (never solid amber). "View in Archive" link top-right on Create; "Back to Archive" on Archive detail. Turning Show answers off never hides a question's own answer field/check button — only the correct answer/model answer/key points/explanation link.
- **Loading state:** three skeleton cards (`animate-pulse`, card surface, no content) replace the result area.
- **Error state:** card surface, error-tinted border/background, a localized message per error code (`too_short`, `too_long`, `too_long_chars`, `not_supported`, `model`, `upstream`, `parse`, `network`, `not_configured`), "Try again" button.
- **Incomplete-count note:** if generation couldn't reach the requested count even after automatic top-up retries, a note reads "X of Y questions were created." next to a "Create the rest" button.
- **Undo snackbar:** fixed bottom-centered navy pill after deleting a question, amber "Undo" action, auto-dismisses.

### 7.15 Question cards
Card surface (warm border, radius 14), one per question, vertical list.
- **Header row:** amber circle number (same style as 7.11 step badges), amber-tinted type pill (e.g. "Multiple Choice"); non-editing/non-practice view shows Edit/Regenerate/Delete icon buttons pinned right (each with a tooltip/`aria-label`). While regenerating: centered spinner over a semi-transparent overlay.
- **Shared answer bar (`AnswerBar`):** used by fill-blanks/short-answer/open-ended — a single-line input (fill-blanks) or textarea (2 rows short-answer, 4 rows + character counter for open-ended) with an amber-outline square check button. Result line (`aria-live="polite"`, never color-only): check + "Correct!" (green), check + "Partly correct" (amber, short-answer/open-ended only), or cross + "Not yet. Try again." (red); short-answer/open-ended add one AI feedback sentence + a coverage count that never names the missing points/model answer. A failed AI grading call shows a localized error line with inline "Try again". Checking: fill-blanks is local-only (lenient normalization + typo tolerance); short-answer tries local first, falls back to `/api/grade`; open-ended always calls `/api/grade`. Enter checks fill-blanks/short-answer; open-ended reserves Enter for newline, checks on Ctrl/Cmd+Enter. State is per-question, memory-only, resets on edit/regenerate/replace.
- **By type:** mcq/true-false render a native radio group + check button (correct = green tint+icon, wrong = red tint+icon, correct option never revealed, re-checkable); Show answers overlays a separate read-only amber-tinted correct answer. fill-blanks: dashed-underline blank + answer bar; answer shown in bold amber-hover above the bar when Show answers is on. short-answer/open-ended: a "Model answer" block (muted paper box) above the answer bar when Show answers is on. matching: two columns (numbered left, lettered right, same box style as mcq options), 4–6 pairs (never fewer than 3), right column always shuffled (`rightOrder`, stable via id when absent — `getRightOrder()` in `src/lib/matching.ts`); a checkable student-answer field (`MatchingColumns`) below regardless of Show answers state (tolerant parsing of `1-A`/`1A`/`1=A`/reversed/etc.), incomplete answers show a hint instead of a wrong result, complete answers show a green/red summary line + per-left-item check/cross marks (never revealing the correct letter). All question text renders through 7.12.
- **Explanation:** collapsed behind a "Show/Hide explanation" toggle; the toggle itself stays unrendered until the first check (any type) or Show answers is on.
- **Hint button:** a small secondary square button (light bulb icon, muted border, never solid amber) to the left of the check button, present only when the question has hints and the Hints setting was on. States: "Hint" (unrevealed) → "Another hint" (1 revealed) → disabled "No more hints" (2 revealed, `max 2`). Hidden entirely when Show answers is on or the student already answered correctly. Revealed hints render numbered in a soft amber box (`bg-amber/10`, amber text token) above the result line, `aria-live="polite"`. Hint reveal state is per-question, memory-only, resets on edit/regenerate/replace (same signature as the answer-check state, 7.15 above).
- **Edit mode:** inline form scoped to the question's type (option/pair rows with add/remove, true/false picker, or textarea), Save (solid amber) / Cancel (outline). Matching: 3–6 pairs, validated against empty/duplicate values, recomputes `rightOrder` on save. Fill-blanks/short-answer add an "Accepted answers" textarea (up to 4, optional); open-ended adds a required "Key points" textarea. Every type also gets two optional "Hint 1"/"Hint 2" fields (max 140 chars each); Save runs the same deterministic leak check as generation against the draft's current answer and blocks with a localized error if a hint would reveal it.

### 7.16 Print / PDF
Triggered by "Print / PDF" (`window.print()`). A screen-hidden, semantic print layout becomes the only visible content under `@media print`: black on white, quiz title + numbered questions (options/pairs listed, unmarked) first, then "Answer Key" on its own page (`page-break-before`) with each answer + explanation — independent of the on-screen Show answers state. Sidebar/top bar/interactive controls hidden. Ruled writing lines: 1 for fill-blanks, 2 for short-answer, 4 for open-ended; model answers/key points appear only on the Answer Key page.

### 7.17 Archived quiz view & Study Mode practice
At `/archive/:id`: same header/question list as 7.14–7.15 when Study Mode is off, plus:
- **Not found:** centered card (archive icon, "Quiz not found", "Back to Archive" button) for a deleted/invalid id.
- **Study Mode practice:** when the row's Study Mode toggle is on, header controls reduce to the Study Mode toggle alone; each question renders as a practice card (no edit actions, no explanation toggle) using the same checkable/retryable UI as 7.15 for every type, hint button included. Once every card has been answered once, a summary row appears ("3 / 5 correct") plus a muted "Hints used: N" line when at least one hint was revealed during the session, with "Try again" to clear and reshow (also resets the hint count).

### 7.18 "Turn into a song"
Entry point: a secondary button (music-note icon, card surface, warm border, never solid amber) in the quiz result header's action row (7.14) and the archived quiz view — rendered only once `GET /api/song` reports the feature enabled (hidden entirely otherwise, including while that check is in flight).
- **Panel:** opens as a right-side panel on desktop (max-width 420px) / bottom sheet on mobile (max-height 85vh, rounded top), a scrim backdrop, `role="dialog"`, focus trapped, Escape and a header close button both close it and return focus to the trigger.
- **Step A — Options:** style chips and a second row of tone chips (same pill style — unselected: card surface/warm border; selected: `bg-amber/15` + `border-amber` + amber-hover text, never solid amber; tone is Normal/Funny, default Normal), length shown as dynamic text ("About N seconds" — scales with the quiz's question count, capped to the active provider's longest supported song), then an outline "Write lyrics" button.
- **Step B — Lyrics:** the resolved length note, a partial-coverage note ("X of Y facts are in this song") when the provider's length cap trimmed the quiz, an editable monospace textarea with `[Intro]`/`[Verse]`/`[Chorus]`/`[Bridge]`/`[Outro]` tags and a character counter (turns error-red over the limit, which scales with length), an amber-tinted non-blocking fact-check warning (title + the specific flagged lines, or a generic line when none are pinpointed) when the server-side fact checker couldn't fully verify the lyrics, and the solid-amber "Make the song" button (the panel's one primary action, disabled when empty or over the limit) — pressing it silently re-checks the (possibly edited) lyrics first and refreshes the warning before generating.
- **Step C — Creating:** centered pulsing music-note icon, a calm rotating status line (`aria-live="polite"`), and an outline Cancel button that aborts the request and returns to Step B with no error.
- **Step D — Player** (`SongPlayerCard`, shared with the Archive "Listen" section, 7.13/7.17): optional "Demo sound" badge (amber-tinted pill) when the response used the demo provider; custom play/pause, seek and volume controls plus a Download link around a native (visually hidden) `<audio>` element; the final lyrics below the player; the fact-check warning again if still unresolved; a muted AI-disclosure line; an outline "Make another" button resets to Step A.
- **Storage:** songs are saved client-side to IndexedDB, keyed by quiz id (see CLAUDE.md); a save failure shows a muted note but the song still plays for the session.
- **Errors:** every step shows a localized message + outline "Try again" for its own error codes (`not_configured`, `disabled`, `too_long`, `blocked`, `upstream`, `timeout`, `parse`, `network`, `storage_full`), plus a daily per-quiz generation-limit note and a separate daily total-seconds-of-songs limit note.

## 8. Iconography
Outline line icons, stroke ~1.75–2px, rounded caps/joins. 16px in nav/tabs/buttons, 20px for the CTA sun icon. Color inherits context (navy on amber, paper/amber on navy sidebar). The sun icon (circle + 8 rays) is the only "AI moment" motif, used on the CTA only.

## 9. Interaction & Motion
- Transitions: 150–200ms ease-out for color/background/border/shadow/transform.
- One entrance fade (opacity + 4px translateY) on main content mount.
- Hover lift on the CTA only (1px + glow); no bouncing or large motion.
- Focus never stacks: mouse/touch focus shows only a 1px `#D8CDB4` border (no ring/glow); keyboard `:focus-visible` shows a single 2px amber ring, 2px offset — never both.
- Respect `prefers-reduced-motion` (animations/transitions collapse to ~0).

## 10. Content & Voice
- Clear, warm, human tone. No hype words. Button labels start with a verb ("Generate Quiz", "Solve", "Clear Input"). Numbers use thousands separators (5,000).
- Every string comes from an i18n file (`en`, `tr`, `hyw`); never hard-code widths on labels.
- Never ship a control with no real behavior behind it (no placeholder Logout/Account/Upgrade) — add UI only once the feature exists.

| Key | EN | TR |
|---|---|---|
| `hero.title` | Turn anything you read into a quiz. | Okuduğun her şeyi bir quize dönüştür. |
| `cta.generate` | Generate Quiz | Quiz Oluştur |
| `params.eyebrow` | Quiz Parameters | Quiz Ayarları |

## 11. Accessibility
- Text contrast ≥ 4.5:1 (`muted` `#6B6F85` on paper/card passes for 14px+); active nav item (amber bar + full-opacity paper on navy) passes AA.
- Every icon paired with visible text or `aria-label`. Toggles use `role="switch"` + `aria-checked`. Tabs use `role="tablist"`/`role="tab"` with arrow-key navigation. Selects follow the WAI-ARIA listbox pattern (7.10).
- Minimum touch target 40×40px. Respect `prefers-reduced-motion`.

## 12. Design Tokens (copy-paste)

Tailwind v4 `@theme` (in `src/index.css`):
```css
@theme {
  --font-sans: 'Plus Jakarta Sans', 'Noto Sans Armenian Variable', sans-serif;
  --font-serif: 'Fraunces Variable', 'Noto Serif Armenian Variable', serif;

  --color-navy: #0e1330;
  --color-ink: #14172b;
  --color-muted: #6b6f85;

  --color-amber: #f5a524;
  --color-amber-hover: #e0931a;
  --color-ember: #ff7a2f;

  --color-paper: #fbf7ef;
  --color-card: #fffefb;
  --color-warm-border: #ece5d6;
  --color-focus-neutral: #d8cdb4;

  --color-success: #1f8a5b;
  --color-error: #d64545;
}
```

## 13. Do and Don't

**Do**
- Reserve amber for the single primary CTA, the active nav marker, and focus accents.
- Use borders and warm whitespace to separate; keep shadows very soft.
- Use Fraunces for headings only; keep UI text in Plus Jakarta Sans.
- Keep sidebar labels short (max 2 words in EN).

**Don't**
- Don't add third-party promos, founder contact lines or cross-app banners on the main screen.
- Don't reintroduce the indigo/violet palette, the blue page background, or the sparkle icon.
- Don't use gradients anywhere except the one approved top-right radial glow.
- Don't use ember (`#FF7A2F`) for large areas — tiny highlights only.
- Don't set fixed pixel widths on text containers (Turkish/Armenian will overflow).

New screens must reuse the tokens and components above; add new components to this file before using them.
