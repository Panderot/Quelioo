# Quelio Design System

> **Product:** Quelio, an AI quiz generator (text, file, URL, YouTube, image, PDF, video to quiz)
> **Tagline:** Questions that shine.
> **Audience:** Teachers, students, HR/training teams. Turkey + global (EN/TR).
> **Identity:** "Solar Paper" — a calm, warm, editorial look built around Quelio's meaning (question + Helio/sun): dark navy and amber sun on cream paper. No purple, no blue-violet gradients, no sparkle icon.

---

## 1. Design Principles

1. **Calm and trustworthy.** Warm cream paper, soft warm borders, no visual noise. Teachers should feel in control.
2. **One primary action per screen.** The solid amber "Generate Quiz" button is the hero. Everything else is quieter.
3. **Editorial, not generic.** A serif display face (Fraunces) for headings gives Quelio a distinct, human voice instead of the default AI-tool look.
4. **Consistent rhythm.** 4px spacing base, a small set of radii, one shadow language.
5. **Bilingual-ready.** Layouts must survive longer Turkish labels (about 30% longer than English).

---

## 2. Brand

| Element | Spec |
|---|---|
| Logo mark | A bold "Q" ring; the tail is a golden ray ending in a small sun disc with short rays. Bowl color adapts to background: cream on the navy sidebar, navy on light/paper backgrounds (favicon). No container, no sparkle. |
| Wordmark | "Quelio", Fraunces, weight 600, about 24px |
| Tagline | "Questions that shine.", about 12px, semibold, amber `#F5A524`, sits under the wordmark on the navy sidebar (cream/amber tone) |
| Meaning | Question + Helio (sun): the rising-sun ray is the brand motif, not a sparkle |

---

## 3. Color

### 3.1 Core palette

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

### 3.2 Backgrounds and gradients

- Page/main area background is flat `--color-paper`. No gradients on backgrounds or buttons.
- Exactly one soft accent is allowed: a radial glow, amber at ~8% opacity, positioned in the top-right corner of the main content area:

```css
background: radial-gradient(circle, rgba(245, 165, 36, 0.08) 0%, rgba(245, 165, 36, 0) 70%);
```

### 3.3 Contrast

All text must keep WCAG AA contrast. Navy text on amber is required for the CTA (`text-navy` on `bg-amber` passes AA for bold UI text).

---

## 4. Typography

**Headings (H1, page-level titles):** `Fraunces Variable` (soft optical variant), weight 600, tight tracking. Installed via npm (`@fontsource-variable/fraunces`), no CDN — imported in `src/index.css`.

**Body and UI:** `Plus Jakarta Sans`, loaded via Google Fonts, weights 400–800 (unchanged).

Both faces must render Turkish glyphs correctly (İ ı ğ ş ç ö ü) — verified via the `latin` + `latin-ext` Fraunces subsets.

**Armenian fallback (hyw locale):** Fraunces and Plus Jakarta Sans have no Armenian glyphs. `Noto Serif Armenian Variable` and `Noto Sans Armenian Variable` (installed via npm, `@fontsource-variable/noto-serif-armenian` / `@fontsource-variable/noto-sans-armenian`) are appended as fallbacks in the `--font-serif` / `--font-sans` stacks so Armenian text renders instead of showing missing-glyph boxes. Latin text is unaffected — these fonts only activate for Armenian-script characters.

| Role | Size / Line height | Weight | Font | Color |
|---|---|---|---|---|
| Page title (H1) | 24–30px / 1.3 | 600 | Fraunces | navy |
| Subtitle | 14px / 1.5 | 400 | Plus Jakarta Sans | muted |
| Eyebrow / section label | 11–12px / 1 | 700 (bold) | Plus Jakarta Sans | muted, uppercase, letter-spacing 0.05–0.08em |
| Field label (parameters) | 11px / 1 | 700 | Plus Jakarta Sans | muted, uppercase |
| Input / select value | 14–15px / 1.4 | 500–600 | Plus Jakarta Sans | ink |
| Nav item | 14px / 1 | 500 (active 600) | Plus Jakarta Sans | paper at 60% (active: full paper) |
| Tab label | 14px / 1 | 500 (active bold) | Plus Jakarta Sans | muted (active: ink) |
| Button (hero) | 16px / 1 | 700 | Plus Jakarta Sans | navy (on amber) |

---

## 5. Spacing, Radius, Shadow

### 5.1 Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48` px — unchanged from before.

### 5.2 Border radius

| Token | Value | Usage |
|---|---|---|
| Small | 10px | Parameter selects |
| Medium | 14px | Input card, quiz-parameters panel, Generate button |
| Large | 16–24px | Reserved for future large surfaces |
| Full | 9999px | Avatar, toggle |

### 5.3 Shadow

Shadows stay very soft; borders (`--color-warm-border`) do most of the separation work.

```css
--shadow-card: 0 1px 2px rgba(14, 19, 48, 0.04);
--shadow-cta-hover: 0 8px 20px rgba(245, 165, 36, 0.30);
```

---

## 6. Layout

### 6.1 App shell

Full-bleed, no floating window:

```
App root (flex, bg-paper)
├── Sidebar (navy, fixed width 256px / icon rail 72px / drawer below 768px)
└── Main column (flex 1, bg-paper, subtle top-right amber radial glow)
    ├── Top bar (flat, height 80px, no heavy border)
    └── Content (padding 24–40px, max-width 5xl content column, fade-in on mount)
```

### 6.2 Content column order (top to bottom)

1. H1 (Fraunces) + subtitle
2. **Input card** (card surface, 1px warm border, radius 14, padding 20–24)
   - Info row: plan info + word count (left), Output Language select (right)
   - Divider
   - Input tabs (Text, File, URL) — amber underline on active
   - Textarea (dashed warm border → solid amber on focus, text tab only)
   - Footer row: Clear Input only
3. Eyebrow: `QUIZ PARAMETERS`
4. **Single parameters panel** (2 columns, hairline dividers, not four separate cards)
5. **Generate Quiz** full-width button (height 56, radius 14, solid amber)

### 6.3 Responsive behavior

| Breakpoint | Behavior |
|---|---|
| >= 1280px | Full layout as above |
| 1024 to 1279px | Sidebar stays; content padding 32px |
| 768 to 1023px | Sidebar collapses to icon-only rail (72px), labels hidden |
| < 768px | Sidebar becomes a slide-over drawer behind a hamburger; parameter grid becomes 1 column |

---

## 7. Components

### 7.1 Sidebar

- Width **256px** (72px icon rail at md, drawer below 768px), background `--color-navy`, text in `--color-paper`.
- **Header:** logo mark + Fraunces wordmark, tagline in amber below. Padding ~20px.
- **Main nav:** Create, then Solve (calculator icon), in that order.
- **Nav item:** no filled active pill. Default text `paper/60`, hover `paper`. **Active** (matches current route): a 3px amber bar on the left edge + full-opacity paper text + amber icon.
- **Footer group** (Archive): pinned to the bottom, top border `paper/10`. Routes to `/archive`. No Account item — there is no account/auth system yet, and a nav item that goes nowhere is worse than no nav item; add it back once a real account page exists.

### 7.2 Top bar

Height 80px, flat (no heavy border), flex, items centered. All content sits right-aligned (mobile menu button is the only left-side element, and only appears below 768px). Currently holds only the language switcher — no Logout or Avatar, since there is no auth/account system to back them; add those controls back once real sign-in exists, not before.

- **Language switcher:** ghost button — globe icon + current language's short code (EN / TR / ՀԱՅ) + chevron — opens a listbox menu (card surface, warm border, radius 12) with the three languages in their own native name. Fully keyboard operable: `Enter`/`Space`/`ArrowDown` opens it, arrow keys move between options, `Escape` closes and returns focus to the button.

### 7.3 Input card

Card surface, 1px warm border, radius 14, padding 20–24.

Info row unchanged in structure (word-limit line + word count left, output language right) but restyled to the warm palette. The word-limit line states only the actual generation limit (30–5,000 words) — no plan tiers, no "Upgrade" link, since there is no billing system.

### 7.4 Tabs

Row with icon (16px) + label, bottom border on the row. **Active:** ink text (bold), 2px **amber** underline. **Inactive:** muted, hover ink.

### 7.5 Textarea / URL / YouTube inputs

- Background `--color-card` (no separate gray fill), **dashed** warm border by default, turns **solid amber** on focus with a soft amber ring.
- **Error:** border/ring `--color-error`.
- **Truncation note:** whenever extracted or pasted content is capped at 5,000 words (File, URL — see 7.5a/7.5b), a small amber-hover line appears directly under the input area: "Only the first 5,000 words are used."

### 7.5a File tab

- **Empty state:** input-card dropzone (dashed warm border, matches 7.11's Solve upload area) — icon, "Drag and drop a file here" title, a muted subtitle listing accepted types and the 10MB cap, a "Browse files" button, and a muted privacy line ("Your file is read in your browser and is not uploaded.") since extraction happens entirely client-side (pdfjs-dist for PDF, mammoth for DOCX, plain read for TXT/MD, all lazy-loaded so the main bundle doesn't grow).
- **Extracting state:** the dropzone is replaced by a centered spinner and a muted "Reading your file..." label while client-side extraction runs.
- **File chip (success):** card surface (warm border, radius 16) replacing the dropzone — file icon, file name (truncates), a meta line (size · word count), and a trash "Remove file" icon button top-right. Below a hairline divider: a "Show preview" / "Hide preview" text toggle (chevron rotates) that expands a scrollable muted `paper`-background box with the extracted text, and an "Edit as text" text link (pencil icon) that copies the extracted text into the Text tab and switches to it.
- **Error state:** the dropzone area turns error-tinted (border/background) with a localized message for unsupported type (incl. old `.doc`), file too large, password-protected PDF, scanned PDF with no extractable text (OCR not supported), corrupt file, empty file, or not enough text — plus a "Choose another file" button that reopens the picker.

### 7.5b URL tab

- **Idle/typing:** the same dashed-border URL input as before, now paired with a solid-amber "Fetch" button to its right (Enter in the field also triggers a fetch).
- **Fetching:** button shows a small spinner; a muted "Fetching the page..." line appears below the input.
- **Success:** the fetched result renders as a card below the input — a success check icon, the page title (or the URL if no title), a word-count meta line, the same truncation note as 7.5a when capped at 5,000 words, and the same "Show preview" / "Edit as text" controls as the File tab's chip.
- **Error state:** an error-tinted card with a localized message (invalid URL, blocked/unsafe address, unreachable, timeout, not an HTML/text page, no readable article text, YouTube not supported, too many redirects) and a "Try again" button.

### 7.6 Ghost button (Clear Input)

Card surface, 1px warm border, radius 12, muted text, hover border/text shift to error tone (signals a destructive-ish clear action) without being alarming by default.

### 7.7 Toggle (Study Mode, Show answers)

Same switch styling wherever a binary on/off control is needed: each Archive row's Study Mode toggle, the Study Mode toggle repeated in a quiz's detail header (7.17), and the result view's Show answers toggle (7.14). Track **off** = warm-border with card-colored knob; **on** = amber with knob moved right. `role="switch"`, `aria-checked`, `aria-label` includes the quiz title where relevant.

### 7.8 Parameters panel

One panel (card surface, 1px warm border, radius 14) with a 2-column grid and hairline (`warm-border`) dividers between cells instead of four separate bordered cards. Field label: 11px bold uppercase muted, 4px above the select trigger (see 7.10 for the trigger's own visible-box spec — it always shows its border, in every state, so the four fields read as identical regardless of hover/focus).

- **Question Type options** (in order): MCQ (Multiple Choice Questions), True or False, Fill in the Blanks, Short Answer, Matching, Open-ended, Mixed.
- **MCQ Options Count** only applies to types that contain multiple-choice questions — MCQ and Mixed. For every other type the field stays in place (no layout shift) but renders in the dropdown's disabled state (7.10) with a short muted helper line underneath it explaining it only applies to multiple choice and mixed. The last chosen options count is preserved and restored when switching back to MCQ or Mixed.

### 7.9 Primary CTA (Generate Quiz)

- Full width, height **56px**, radius 14, solid **amber**, navy bold text. No gradient.
- Icon: custom outline **sun** icon (circle + short rays), not a sparkle.
- **Hover:** background steps to `amber-hover`, button rises 1px (`translateY(-1px)`) with a soft amber glow shadow.
- **Active/pressed:** returns to `translateY(0)`.
- **Loading:** spinner (navy) replaces the sun icon, label "Generating your quiz...".

### 7.10 Select / dropdown

Every choice field (the four quiz-parameter selects, Output Language, the top-bar language switcher) shares one custom listbox component — no native `<select>` anywhere in the app, since the browser/OS-drawn option list can't be restyled and clashes with the warm palette.

- **Trigger:** two variants, both a **visible field at rest in every state** — the box never appears or disappears depending on hover/focus, so all triggers on a page read as identical. `param` (the four parameter-grid selects): 1px warm border `#ECE5D6`, radius 10px, `card` background, height 44px, 16px left padding for the value, chevron 16px from the right edge, ≥44px reserved between the value and the chevron so long labels never touch it. `boxed` (Output Language, compact): same states, radius 8px, `paper` background, 12px left padding, chevron 12px from the right edge, ≥36px reserved before it. Value on the left (truncates with an ellipsis before it can overlap the chevron), a chevron on the right that rotates 180° when open. Border width and padding never change between states — only the border color changes, so nothing shifts layout.
- **Menu:** `card` background, 1px warm border, radius 12, soft warm shadow, 6px inner padding, rendered in a portal so it always sits above surrounding content (never clipped or covered by the Generate button). Width matches the trigger exactly; long labels wrap instead of overflowing. Max-height ~280px with a thin warm scrollbar past that. Opens below the trigger, flips above it when there isn't room below (e.g. the last parameter row).
- **Rows:** min 40px tall, 10px radius, 15px text, generous horizontal padding. Hover and keyboard-highlighted rows get a light amber tint (~12% opacity) — never a blue/native highlight. The selected row is semibold with an amber check icon on the right.
- **States:** at rest the border is `warm-border`; hover, mouse-click focus, and the open state all show the same slightly darker warm-neutral border `#D8CDB4` (1px) — the same look whether opened by mouse or keyboard, with no ring stacked on top of it. Keyboard focus (`:focus-visible`) adds a single 2px amber ring with a 2px offset instead. The chevron rotates 180° when open.
- **Disabled:** trigger keeps its usual visible box (same border, radius, background — no layout shift) but the value text and chevron render muted, the cursor shows not-allowed, it does not open on click or key press, is not reachable by Tab, and carries `aria-disabled="true"` alongside the native disabled state. Used e.g. for MCQ Options Count when the selected Question Type isn't MCQ or Mixed (7.8).
- **Motion:** 120ms fade + 4px slide on open/close; respects `prefers-reduced-motion`.
- **Keyboard:** WAI-ARIA listbox pattern — trigger is a button with `aria-haspopup="listbox"`, `aria-expanded`, `aria-labelledby` (pointing at the visible field label) and `aria-activedescendant`; the menu is `role="listbox"` with `role="option"` rows. Arrow keys move the highlight, Home/End jump to the ends, Enter/Space selects, Escape closes and returns focus to the trigger, typing jumps to a matching label (type-ahead). Closes on outside click, Escape, Tab, and after a selection.

**Output Language variant (searchable/grouped):** the Output Language field on Create is a separate component (not the shared listbox above — it needs search and groups the plain listbox doesn't support) but reuses the same tokens so it reads as the same family: `boxed` trigger styling, `card`-background portal menu with 1px warm border, radius 12, soft warm shadow, amber-tinted (~12% opacity) hover/highlight rows, semibold selected row with an amber check icon, thin warm scrollbar, the same 120ms fade+slide motion and `:focus-visible` amber-ring rule. Fixed 260px width, right-edge-aligned to the trigger and clamped to the viewport (never overflows off-screen). Languages are always shown by **native name** (autonym), never an English gloss, except the "Auto" entry which stays localized to the UI language. Differences from the plain listbox:
  - A search input pinned at the top of the menu, auto-focused on open. Matches against native name, English name, and (for Turkish-speaking users) a Turkish alias, case/diacritic-insensitive.
  - While the search is empty, rows are grouped under two uppercase muted group headers — "Suggested" (Auto, Turkish, English, Western Armenian) and "All languages" (the rest, alphabetized by English name). While searching, the group headers are hidden and results render as one flat filtered list; an empty result shows a centered muted "No languages found" row instead of headers.
  - Row text carries `dir="auto"` so right-to-left scripts (Arabic, Hebrew, Persian, Urdu) render correctly regardless of UI language direction.
  - Arrow keys/Enter operate on the flat list of currently visible rows (grouped or filtered), starting from the search input; typing goes into the search field instead of jumping by first-letter type-ahead.

### 7.11 Solve page

Same shell as Create (sidebar, top bar, `max-w-5xl` content column). Page title in Fraunces ("Solve a math question") + one-line muted subtitle.

- **Upload area:** input-card surface (warm border, radius 14). While empty, a dashed-border dropzone (matches 7.5's file-tab styling) — click to choose, drag-and-drop, paste from clipboard, and on mobile the file input opens the camera (`capture="environment"`). Once a photo is chosen, the dropzone is replaced by a preview image (rounded, bordered, `object-contain`, max height ~360px) with a "Change photo" text link below it that re-opens the picker.
- **Primary CTA:** same solid-amber/navy-text button as Generate Quiz (7.9), label "Solve", disabled until a photo is selected. Loading state swaps the sun icon for the spinner and the label for "Solving...".
- **Result card:** card surface (warm border, radius 14). Topic as a small bold uppercase amber-hover label, then the question, then numbered steps — each step is a row with a small filled-amber circular badge (number, navy bold text) beside the step text. The final answer renders as an inline amber-tinted chip (`bg-amber/15`, rounded, bold navy text) with an uppercase amber-hover "Answer" label. The tip sits below in a muted `paper`-background box with a warm border. All model-provided text (question, steps, answer, tip) renders through the shared math-aware text component (7.12) rather than being shown as raw markup.
- **Demo notice:** shown above the result card when the response is a fallback sample (no API key configured) — a muted amber banner (`border-amber/30`, `bg-amber/10`, amber-hover bold text).
- **Error state:** card surface with an error-tinted border/background, a localized message per error code, and a "Try another photo" secondary button that resets the page.
- **Secondary action:** below the result, an outline "Create a quiz on this topic" button (warm border, `card` background, navy bold text, border turns amber on hover — never the solid amber CTA style, since Solve already reserved for Solve). Navigates to Create with the topic/question/steps/answer prefilled into the text textarea (Question Type MCQ, Difficulty Medium — both already the Create page defaults).
- **Footer note:** small centered muted line under the result, framing Quelio as a learning tool rather than an answer-copying shortcut.

### 7.12 Math text rendering

Model output (question/steps/answer/tip on the Solve page) mixes plain text with LaTeX (`$...$` inline, `$$...$$` block). A shared component splits each string into text and math segments and renders math via KaTeX (`trust: false`, `throwOnError: false`) — never `dangerouslySetInnerHTML` on raw model text directly, only on KaTeX's own generated markup.

### 7.13 Archive page

Same shell as Create (sidebar, top bar, `max-w-5xl` content column). Page title in Fraunces ("Archive") + one-line muted subtitle.

- **List:** single column, newest first (not a card grid). Container is one card surface (warm border, radius 14) with hairline (`warm-border`) dividers between rows instead of separate bordered cards per item.
- **Row:** title is a link to `/archive/:id` (ink, semibold, truncates, amber-hover on hover/focus), a meta line (question count • type • difficulty, muted, reuses `params.*` labels; an extra "• N Options" segment is appended only for MCQ and Mixed entries, since those are the only types an options count is stored for), the created date/time formatted for the active locale (muted), and a Study Mode toggle pinned right, outside the link (see 7.7). Long Turkish/Armenian titles truncate with ellipsis rather than wrapping the row taller.
- **Empty state:** centered card surface with the archive icon, a short title ("No quizzes yet"), a subtitle that makes clear quizzes are made on the Create page ("Quizzes you create in the Create section will appear here."), and one **secondary** "Go to Create" button linking to `/` — outline style (warm border, `card` background, navy bold text, border turns amber on hover), never the solid amber CTA style, which stays reserved for the single primary action per screen (Generate Quiz).

### 7.14 Quiz result view (Create page, and Archive detail when Study Mode is off)

Shown below the Generate button on the Create page after a successful generation (auto-scrolled into view, respecting `prefers-reduced-motion`), and reused unchanged at `/archive/:id`. Same shell content column, not a modal.

- **Demo notice:** shown above the result header when the response is a fallback sample (no API key configured) — the same muted amber banner as Solve (7.11).
- **Header:** card surface (warm border, radius 14). Editable title in Fraunces (pencil icon toggles an inline text input with Save/Cancel) and a meta line (question count • type • difficulty • output language, muted, reuses `params.*` labels; the output language segment shows the language's native name, or the localized "Auto" label via `inputCard.outputLanguage.auto` when set to automatic). A hairline divider, then a left-to-right action row: the Study Mode toggle (only present on the Archive detail page, 7.17), the Show answers toggle (7.7, **off by default** every time a quiz is shown — the student must opt in), then two secondary buttons — **Copy** and **Print / PDF** (outline style, warm border, `card` background, navy/ink text, border turns focus-neutral on hover — never solid amber, which stays reserved for Generate Quiz/Solve). On the Create page only, a "View in Archive" text link sits top-right; on the Archive detail page it reads "Back to Archive" instead. Show answers toggling off never hides a question's answer field or check button — it only hides the correct answer/model answer/key points/explanation link, so the student can keep answering either way.
- **Loading state:** while generating, three skeleton cards (`animate-pulse`, card surface, no content) replace the result area; the Generate button keeps its own spinner/label state (7.9).
- **Error state:** shown in place of the result when generation fails — card surface with an error-tinted border/background, a localized message per error code (`too_short`, `too_long`, `too_long_chars`, `not_supported`, `upstream`, `parse`, `model`, `network`), and a "Try again" secondary button.
- **Incomplete-count note:** if the model couldn't reach the exact requested question count even after the server's automatic top-up retries, a card surface note reads "X of Y questions were created." next to a "Create the rest" button that requests just the missing questions and appends them to the result.
- **Undo snackbar:** a fixed, bottom-centered dark navy pill (`bg-navy`, `text-paper`) appears after deleting a question, with an amber "Undo" action; auto-dismisses after a few seconds.

### 7.15 Question cards

Card surface (warm border, radius 14), one per question, in a vertical list with consistent gaps.

- **Header row:** a number in an amber circle (same style as Solve's step badges, 7.11), a small type badge (amber-tinted pill, uppercase, e.g. "Multiple Choice"), and — in the non-editing, non-practice view — three icon buttons pinned right: Edit (pencil), Regenerate (circular refresh), Delete (trash), each with a tooltip/`aria-label`. While a single question is regenerating, the card shows a centered spinner over a semi-transparent overlay instead of its content.
- **Shared answer bar (`AnswerBar`, `src/components/AnswerBar.tsx`):** the field/tick-button/result-line pattern reused by fill-blanks, short-answer and open-ended — a single-line input (fill-blanks) or textarea (2 rows short-answer, 4 rows + a small "used/1000" counter near the character limit for open-ended) with an amber-outline square check button to its right (`aria-label`/tooltip "Check answer", localized, same style as the matching check button). The result line beneath (`aria-live="polite"`, never color-only) shows a check icon + "Correct!" (soft green), a check icon + "Partly correct" (soft amber, short-answer/open-ended only), or a cross icon + "Not yet. Try again." (soft red); short-answer/open-ended additionally show one short AI feedback sentence and a coverage count ("2 of 3 key ideas covered") that never names the missing points or the model answer. A failed AI grading call shows a localized error line with an inline "Try again" retry action instead of a result; the check button shows a spinner and disables itself while grading. mcq and true-false reuse the same result-line rendering (not the field) for visual consistency. Checking is local-only for fill-blanks (lenient normalization: trim, Turkish-aware lowercase, diacritics stripped, ı/İ folded to i, collapsed whitespace, trailing punctuation ignored, plus a 1-2 character edit-distance typo tolerance scaled to answer length) and short-answer tries the same local check first, only calling the AI grader (`/api/grade`) when that doesn't match; open-ended always calls the AI grader. Plain Enter checks from the fill-blanks input and the short-answer textarea; open-ended reserves plain Enter for a newline and checks on Ctrl/Cmd+Enter instead. Answer/check state is per question, kept only in memory (never saved to Archive), and resets whenever the question's own answer-defining content changes (edit, regenerate, replace) — never on an unrelated re-render.
- **By type:**
  - **mcq:** options rendered as a native radio group (arrow keys move the selection) labelled A, B, C…; a check button after the list grades the current selection. Correct: the chosen option gets a soft green tint and check icon. Wrong: the chosen option gets a soft red tint and cross icon — the correct option is never revealed — and the student may pick again and recheck. When Show answers is on, a separate read-only list above it still tints the correct option in amber, independent of the check state.
  - **true-false:** the same pattern as mcq with two options ("True" / "False") in a native radio group; Show answers still tints the correct chip in amber above the checkable pair when on.
  - **fill-blanks:** the blank rendered as a short dashed underline, with the shared answer bar (single-line input) beneath it; the answer appears as bold amber-hover text above the bar when Show answers is on.
  - **short-answer / open-ended:** a "Model answer" block (muted `paper` background, warm border) shown above the shared answer bar when Show answers is on; the block itself is never part of the checkable flow.
  - **matching:** two clear columns side by side (numbered left items 1, 2, 3…; lettered right items A, B, C…), same box style as mcq options (warm border, radius 10), wrapped in a responsive grid that stacks (numbered list first, then lettered list) below 640px. 4 to 6 pairs (never fewer than 3). The right column always renders in a shuffled order — no position shows its own pair's right value, and for 4+ pairs the shuffle is also never a plain rotation of the identity order or of its reverse — computed as `rightOrder` (an array of pair indexes) and stored on the question so it's stable across renders, reloads, Archive and print; older archived questions without a stored `rightOrder` get one computed deterministically from the question id (see `getRightOrder()` in `src/lib/matching.ts`), so it's still stable without a data migration (their existing stored order, if any, is never re-migrated to the stricter rule). Answers hidden: both columns plain, plus a small muted hint ("Match each number with a letter."). Answers shown: both columns get the same amber tint as a correct mcq option, plus a compact answer-key line ("1 → C · 2 → A · 3 → B") and the readable "Left → Right" pairs list beneath it — never rendered while answers are hidden; each right-hand item additionally shows a small "→ N" badge naming the left number it belongs to, instead of the plain check icon used elsewhere.
    Below both columns, a checkable student-answer field (shared with Study Mode, `MatchingColumns` component) regardless of the Show answers state: a 2-row, no-resize textarea (placeholder shows the literal worked example "1-A, 2-B, 3-C", localized per language) plus an amber-outline square check button (`aria-label`/tooltip "Check answer", localized). Enter (without Shift) also triggers a check. Parsing is tolerant of format (`1-A`, `1A`, `1=A`, `1:A`, `1→A`, `1) A`, lowercase, extra whitespace/newlines, reversed `A-1`, any separator between pairs). An incomplete or unreadable answer never counts as wrong — it shows a small localized hint instead ("Write all {n} matches." / "Use a number and a letter like 1-A, 2-B.") in an `aria-live="polite"` region. Once every pair is answered: an all-correct check shows a green "Correct!" line with a check icon; otherwise a red "Not quite. Check the marked pairs and try again." line, plus a small green check or red cross mark next to each numbered **left** item only (never revealing which letter was correct) — results are never color-only, always paired with the text line and icon. The student can edit their answer and check again as many times as they like; the field and its check state are local to the component only (never saved to Archive) and reset whenever the question's pairs or shuffle change (edit, regenerate, replace). The question's "Show explanation" link (7.15) stays hidden for a matching question until the student completes their first check (right or wrong) or the global Show answers switch is on.
  - All question/option/answer/explanation text renders through the shared math-aware text component (7.12), so any LaTeX in generated content (formulas, symbols) renders correctly.
- **Explanation:** collapsed by default behind a "Show explanation" / "Hide explanation" text toggle; expands into a muted `paper` box. For every question type, the toggle itself stays unrendered (not just hidden) until the student completes their first check (right, partial or wrong) or Show answers is on — never a free spoiler — reset the same way the answer bar resets, on edit/regenerate/replace.
- **Edit mode:** replaces the view with inline form controls scoped to the question's type (option/pair rows with add/remove, a true/false chip picker, or a plain textarea for text answers), plus Save/Cancel buttons (solid amber Save, outline Cancel — the one place a second amber-ish action is allowed, since it's a scoped in-card confirm, not a second page-level primary CTA). For matching, pairs can be added up to 6 and removed down to 3, with validation against empty text and duplicate left/right values; saving recomputes `rightOrder` for the (possibly new) pair count. Fill-blanks and short-answer additionally show an "Accepted answers (one per line)" textarea (up to 4, optional); open-ended shows a "Key points (one per line)" textarea (at least one required to save).

### 7.16 Print / PDF

Triggered by the header's "Print / PDF" button (`window.print()`). A dedicated, screen-hidden print layout (plain semantic HTML, no card chrome) renders alongside the interactive result and becomes the only visible content under `@media print`: black text on white, the quiz title and numbered questions first (options/pairs listed but not marked), then the "Answer Key" on its own page (`page-break-before`) listing each question's correct answer and explanation — independent of the on-screen Show answers state, since print always separates questions from answers. Sidebar, top bar and every interactive control are hidden. Fill-blanks gets one ruled writing line under the question, short-answer two, and open-ended four, so the printed page is directly usable on paper; model answers and key points appear only on the Answer Key page, never under the question itself.

### 7.17 Archived quiz view & Study Mode practice

At `/archive/:id`: the same header and question list as 7.14–7.15 when the entry's Study Mode is off. Three additional states:

- **Not found:** centered card surface (archive icon, "Quiz not found", a "Back to Archive" button) for a deleted or invalid id.
- **Legacy entry:** for archive rows saved before real generation shipped (no stored questions) — centered card surface naming the quiz, a note that it predates saved questions, and a "Go to Create" button.
- **Study Mode practice:** when the row's Study Mode toggle (7.7) is on, the header's Show answers/Copy/Print controls are replaced by the Study Mode toggle alone, and each question renders as a practice card instead of an editable one — no number badge actions, no explanation toggle. Every type uses the exact same checkable, retryable answer UI as the editable result view (7.15) — mcq/true-false as a checkable radio group, fill-blanks/short-answer/open-ended as the shared answer bar (short-answer/open-ended calling the AI grader) — there is no separate "Reveal answer" or self-grade step:
  - **mcq / true-false / fill-blanks / short-answer / open-ended:** identical interaction to 7.15 — check, see the result line (and AI feedback/coverage for short-answer/open-ended), and recheck after changing the answer as many times as needed; each complete check updates that card's score.
  - **matching:** the same checkable `MatchingColumns` field from 7.15 renders directly (answers-hidden state), and checking an answer auto-grades the card from the check result; the student may edit and re-check as many times as they like, each check updating the score.
  - **Score:** once every card has been answered at least once, a summary row appears below the list ("3 / 5 correct") with a "Try again" button that clears all answers and re-shows the cards fresh.

---

## 8. Iconography

- Style: **outline line icons**, stroke ~1.75–2px, rounded caps and joins.
- Sizes: 16px in nav/tabs/buttons; 20px for the CTA sun icon.
- Color inherits text/context color (navy on amber, paper/amber on navy sidebar).
- The sun icon (circle + 8 short rays) is the only "AI moment" motif — used on the CTA only.

---

## 9. Interaction & Motion

- Transitions: `150–200ms ease-out` for color, background, border, shadow and transform changes.
- One subtle entrance fade (opacity + 4px translateY) on the main content on mount.
- Hover lift on the CTA only (1px + glow). No bouncing or large motion.
- Focus states never stack: mouse/touch focus (`:focus` without `:focus-visible`) shows only a slightly darker warm-neutral 1px border (`#D8CDB4`, no ring, no glow, no amber); keyboard focus (`:focus-visible`) shows a single clean 2px amber ring with a 2px offset instead, and never both at once.
- Respect `prefers-reduced-motion` (all animations/transitions collapse to ~0).

---

## 10. Content & Voice

- Tone: clear, warm, human. No hype words.
- Button labels start with a verb: "Generate Quiz", "Solve", "Clear Input".
- Numbers use thousands separators (5,000).
- Every string comes from an i18n file (`en`, `tr`, `hyw`); never hard-code widths on labels.
- Never ship a control (button, link, nav item) that has no real behavior behind it — no placeholder Logout, Account or Upgrade links. Add the UI only once the feature it triggers actually exists.

**Key strings**

| Key | EN | TR |
|---|---|---|
| `hero.title` | Turn anything you read into a quiz. | Okuduğun her şeyi bir quize dönüştür. |
| `hero.subtitle` | Paste text, drop a PDF or share a link. Quelio writes the questions in seconds. | Metni yapıştır, PDF bırak ya da bir bağlantı paylaş. Quelio soruları saniyeler içinde yazsın. |
| `cta.generate` | Generate Quiz | Quiz Oluştur |
| `params.eyebrow` | Quiz Parameters | Quiz Ayarları |

---

## 11. Accessibility

- Text contrast at least 4.5:1 (`muted` `#6B6F85` on paper/card passes for 14px+).
- Active nav item: amber bar + full-opacity paper text on navy passes AA.
- All icons paired with visible text, or given `aria-label`.
- Toggle uses `role="switch"` with `aria-checked`.
- Tabs use `role="tablist"` / `role="tab"` with arrow-key navigation.
- Select/dropdown triggers follow the WAI-ARIA listbox pattern (`aria-haspopup="listbox"`, `aria-expanded`, `aria-activedescendant`) — see 7.10.
- Minimum touch target 40x40px.
- Respect `prefers-reduced-motion`.

---

## 12. Design Tokens (copy-paste)

### 12.1 Tailwind v4 `@theme` (in `src/index.css`)

```css
@theme {
  --font-sans: 'Plus Jakarta Sans', sans-serif;
  --font-serif: 'Fraunces Variable', serif;

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

---

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
- Don't set fixed pixel widths on text containers (Turkish will overflow).

---

## 14. Screen Inventory

| Screen | Status |
|---|---|
| Home / Generate Quiz | **Designed (this spec — "Solar Paper")** |
| Quiz result / editor | **Designed (7.14–7.16)** |
| Solve (`/solve`) | **Designed (7.11)** |
| Archive (`/archive`) | **Designed (7.13)** |
| Archived quiz / Study Mode (`/archive/:id`) | **Designed (7.17)** |
| Not found (unknown route) | **Designed** — same empty-state card pattern as Archive/Solve errors, icon + title + subtitle + a "Go to Create" button linking to `/`. |
| Account / billing | Not yet — no UI for this exists yet; do not add a placeholder nav item or button for it before the feature is real. |
| Landing page | Not yet |

New screens must reuse the tokens and components above; add new components to this file before using them.
