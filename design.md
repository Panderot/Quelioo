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
- **Main nav:** a single item, Create.
- **Nav item:** no filled active pill. Default text `paper/60`, hover `paper`. **Active** (matches current route): a 3px amber bar on the left edge + full-opacity paper text + amber icon.
- **Footer group** (Archive, Account): pinned to the bottom, top border `paper/10`. Archive routes to `/archive`; Account is a placeholder link (no page yet).

### 7.2 Top bar

Height 80px, flat (no heavy border), flex, items centered. All content sits right-aligned (mobile menu button is the only left-side element, and only appears below 768px).

- **Language switcher:** ghost button — globe icon + current language's short code (EN / TR / ՀԱՅ) + chevron — opens a listbox menu (card surface, warm border, radius 12) with the three languages in their own native name. Fully keyboard operable: `Enter`/`Space`/`ArrowDown` opens it, arrow keys move between options, `Escape` closes and returns focus to the button.
- **Logout:** plain text link, muted → ink on hover.
- **Avatar:** 36px circle, solid navy background (no gradient), cream initials, thin amber ring.

### 7.3 Input card

Card surface, 1px warm border, radius 14, padding 20–24.

Info row unchanged in structure (plan blurb + word count left, output language right) but restyled to the warm palette; "Upgrade" link uses `amber-hover`.

### 7.4 Tabs

Row with icon (16px) + label, bottom border on the row. **Active:** ink text (bold), 2px **amber** underline. **Inactive:** muted, hover ink.

### 7.5 Textarea / URL / YouTube inputs

- Background `--color-card` (no separate gray fill), **dashed** warm border by default, turns **solid amber** on focus with a soft amber ring.
- **Error:** border/ring `--color-error`.

### 7.6 Ghost button (Clear Input)

Card surface, 1px warm border, radius 12, muted text, hover border/text shift to error tone (signals a destructive-ish clear action) without being alarming by default.

### 7.7 Toggle (Study Mode)

Used on each Archive row, not on the Create page. Track **off** = warm-border with card-colored knob; **on** = amber with knob moved right. `role="switch"`, `aria-checked`, `aria-label` includes the quiz title.

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

### 7.11 Archive page

Same shell as Create (sidebar, top bar, `max-w-5xl` content column). Page title in Fraunces ("Archive") + one-line muted subtitle.

- **List:** single column, newest first (not a card grid). Container is one card surface (warm border, radius 14) with hairline (`warm-border`) dividers between rows instead of separate bordered cards per item.
- **Row:** title (ink, semibold, truncates), a meta line (question count • type • difficulty, muted, reuses `params.*` labels; an extra "• N Options" segment is appended only for MCQ and Mixed entries, since those are the only types an options count is stored for), the created date/time formatted for the active locale (muted), and a Study Mode toggle pinned right (see 7.7). Long Turkish/Armenian titles truncate with ellipsis rather than wrapping the row taller.
- **Empty state:** centered card surface with the archive icon, a short title ("No quizzes yet"), a subtitle that makes clear quizzes are made on the Create page ("Quizzes you create in the Create section will appear here."), and one **secondary** "Go to Create" button linking to `/` — outline style (warm border, `card` background, navy bold text, border turns amber on hover), never the solid amber CTA style, which stays reserved for the single primary action per screen (Generate Quiz).

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
- Button labels start with a verb: "Generate Quiz", "Upgrade", "Clear Input".
- Numbers use thousands separators (5,000).
- Every string comes from an i18n file (`en`, `tr`); never hard-code widths on labels.

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
| Quiz result / editor | Not yet |
| Archive (`/archive`) | **Designed (7.10)** |
| Account / billing (Upgrade) | Not yet |
| Landing page | Not yet |

New screens must reuse the tokens and components above; add new components to this file before using them.
