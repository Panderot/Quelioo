# Quelio Design System

> **Product:** Quelio, an AI quiz generator (text, file, URL, YouTube, image, PDF, video to quiz)
> **Tagline:** Questions that shine.
> **Audience:** Teachers, students, HR/training teams. Turkey + global (EN/TR).
> **Source of truth:** the approved "Generate Quiz" home screen. All values below were estimated visually from that screen; treat hex codes as the intended palette and fine-tune against the Stitch export if pixel accuracy is needed.

---

## 1. Design Principles

1. **Calm and trustworthy.** Lots of white space, soft borders, no visual noise. Teachers should feel in control.
2. **One primary action per screen.** The gradient "Generate Quiz" button is the hero. Everything else is quieter.
3. **Friendly, not childish.** Rounded corners and a light indigo accent, but professional typography.
4. **Consistent rhythm.** 4px spacing base, a small set of radii, one shadow language.
5. **Bilingual-ready.** Layouts must survive longer Turkish labels (about 30% longer than English).

---

## 2. Brand

| Element | Spec |
|---|---|
| Logo mark | Rounded square (about 32px, radius 8) with indigo-to-blue gradient, white bold "Q", small golden sparkle at top-right corner |
| Wordmark | "Quelio", bold, about 24px, dark navy `#0F172A` |
| Tagline | "Questions that shine.", about 12px, medium, indigo `#4F46E5`, sits under the wordmark |
| Meaning | Question + Helio (sun): the sparkle/sun-ray is the brand motif |

**Sparkle motif:** the golden sparkle (`#F59E0B`) appears in the logo and on the Generate button icon. Use it sparingly for "AI magic" moments only.

---

## 3. Color

### 3.1 Core palette

| Token | Hex | Usage |
|---|---|---|
| `--color-primary-600` | `#4F46E5` | Active nav item, active tab, links, focus ring, primary gradient start |
| `--color-primary-700` | `#4338CA` | Hover/pressed for primary elements |
| `--color-primary-50` | `#EEF2FF` | Subtle primary tint (hover backgrounds, selected chips) |
| `--color-blue-600` | `#2563EB` | Primary gradient end, page background top |
| `--color-success-600` | `#059669` | Upgrade button, success states |
| `--color-success-500` | `#10B981` | "Free runs" status dot |
| `--color-accent-gold` | `#F59E0B` | Sparkle icon and logo accent only |
| `--color-pro-bg` | `#FEF3C7` | PRO badge background |
| `--color-pro-text` | `#92400E` | PRO badge text |

### 3.2 Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--color-ink-900` | `#0F172A` | Headings, wordmark |
| `--color-ink-700` | `#334155` | Labels, body text |
| `--color-ink-600` | `#475569` | Inactive nav text, secondary buttons |
| `--color-ink-500` | `#64748B` | Subtitles, helper text, placeholders |
| `--color-ink-400` | `#94A3B8` | Section eyebrow labels, inactive icons |
| `--color-border` | `#E5E7EB` | Card, input and divider borders |
| `--color-surface-alt` | `#F8FAFC` | Inputs, selects, search field, textarea |
| `--color-surface` | `#FFFFFF` | Cards, sidebar, app container |
| `--color-toggle-off` | `#E2E8F0` | Switch track (off) |

### 3.3 Page background

The outer page uses a diagonal gradient behind the white app container:

```css
background: linear-gradient(135deg, #2563EB 0%, #3B4FDB 50%, #3730A3 100%);
```

### 3.4 Primary gradient (buttons, hero CTA)

```css
background: linear-gradient(90deg, #4F46E5 0%, #2563EB 100%);
```

### 3.5 Avatar gradient

```css
background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
```

---

## 4. Typography

**Font family:** `Plus Jakarta Sans`, fallback `system-ui, -apple-system, "Segoe UI", sans-serif`.
Load weights 400, 500, 600, 700, 800.

| Role | Size / Line height | Weight | Color | Notes |
|---|---|---|---|---|
| Page title (H1) | 32px / 1.2 | 800 | ink-900 | Letter-spacing -0.02em, max width about 800px, wraps to 2 lines |
| Subtitle | 15px / 1.5 | 400 | ink-500 | Directly under H1, 8px gap |
| Card info line | 13px / 1.4 | 400 (bold for numbers) | ink-700 | "5,000 words" is bold |
| Eyebrow / section label | 12px / 1 | 600 | ink-400 | UPPERCASE, letter-spacing 0.08em ("QUIZ PARAMETERS") |
| Field label | 13px / 1.3 | 600 | ink-900 | Inside parameter cards |
| Input / select value | 15px / 1.4 | 500 | ink-900 | |
| Placeholder | 15px / 1.5 | 400 | ink-500 | |
| Nav item | 15px / 1 | 500 (active 600) | ink-600 (active white) | |
| Tab label | 14px / 1 | 500 (active 600) | ink-500 (active primary-600) | |
| Button (small) | 13px / 1 | 500 | ink-700 | Clear Input, Logout |
| Button (hero) | 17px / 1 | 600 | white | Generate Quiz |
| Badge | 11px / 1 | 700 | pro-text | Uppercase |

---

## 5. Spacing, Radius, Shadow

### 5.1 Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48` px

- Card padding: **24px** (large card), **16px** (parameter cards)
- Gap between parameter cards: **16px**
- Gap between major sections: **32px**
- Main content horizontal padding: **40px**
- Outer page padding around the app container: **32px**

### 5.2 Border radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 8px | Selects, small buttons, nav items, Clear Input |
| `--radius-md` | 12px | Textarea, parameter cards, search field |
| `--radius-lg` | 16px | Large cards, Generate button |
| `--radius-xl` | 24px | App container |
| `--radius-full` | 9999px | Chips, avatar, toggle, Free Runs pill |

### 5.3 Shadows

```css
--shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04);
--shadow-active-nav: 0 4px 12px rgba(79, 70, 229, 0.25);
--shadow-cta: 0 8px 20px rgba(79, 70, 229, 0.30);
--shadow-app: 0 24px 60px rgba(15, 23, 42, 0.25);
```

Borders do most of the separation work. Shadows stay subtle.

---

## 6. Layout

### 6.1 App shell

```
Page (gradient background, 32px padding)
└── App container (white, radius 24, shadow-app, overflow hidden, flex)
    ├── Sidebar (fixed width 256px, border-right 1px)
    └── Main column (flex 1)
        ├── Top bar (height 80px, border-bottom 1px)
        └── Content (padding 40px, max-width 880px content column)
```

### 6.2 Content column order (top to bottom)

1. H1 + subtitle
2. **Input card** (white, border, radius 16, padding 24)
   - Info row: plan info + word count (left), Output Language select (right)
   - Divider
   - Input tabs (Text, File, URL, YouTube)
   - Textarea (min-height 240px)
   - Footer row: Clear Input (left), Study Mode toggle (right)
3. Eyebrow: `QUIZ PARAMETERS`
4. **2x2 parameter grid** (gap 16)
5. **Generate Quiz** full-width button (height 56)

### 6.3 Responsive behavior

| Breakpoint | Behavior |
|---|---|
| >= 1280px | Full layout as above |
| 1024 to 1279px | Sidebar stays; content padding 32px |
| 768 to 1023px | Sidebar collapses to icon-only rail (72px), labels hidden, tooltips on hover |
| < 768px | Sidebar becomes a slide-over drawer behind a hamburger; top bar search hidden; parameter grid becomes 1 column; outer page padding 0 and app container radius 0 |

---

## 7. Components

### 7.1 Sidebar

- Width **256px**, white, right border `--color-border`.
- **Header:** logo mark + wordmark, tagline below. Padding 20px 20px 16px.
- **Nav list:** padding 12px, items stacked with 4px gap.
- **Nav item:** height 40px, padding 0 12px, radius 8, icon 16px + 12px gap + label.
  - Default: text ink-600, icon ink-400
  - Hover: background `#F1F5F9`, text ink-900
  - **Active:** background primary-600, text white (600), icon white, `--shadow-active-nav`
- **PRO badge** (e.g. AI Slides): right-aligned, padding 2px 8px, radius full, bg `#FEF3C7`, text `#92400E`, 11px bold uppercase.
- **Footer group** (Saved, Account): pinned to the bottom, top border 1px, same item style.

**Nav order:** Home, Bloom's Quiz, Similar Quiz, Illustrate Story, Image to Quiz, Matching Quiz, Video to Quiz, News to Quiz, PDF to Quiz, YouTube to Quiz, AI Slides (PRO). Footer: Saved, Account.

### 7.2 Top bar

Height 80px, padding 0 40px, flex, items centered, gap 16px, bottom border.

- **Search field** (flex 1, max 384px): height 40, bg surface-alt, border, radius 12, left search icon, placeholder "Search templates & history..."
- **Free Runs chip:** radius full, bg `#F1F5F9`, padding 6px 12px, 12px semibold text, 8px green dot (`#10B981`) on the left. Text: "Free Runs Remaining: 20".
- **Upgrade button:** bg success-600, white text 600, height 40, padding 0 16px, radius 10, lightning-bolt icon 16px on the left. Hover `#047857`.
- **Logout:** plain text button, ink-600, 14px 500, no border. Hover ink-900.
- **Divider:** 1px vertical line, 32px tall, before the avatar.
- **Avatar:** 36px circle, avatar gradient, white bold initials (13px).

### 7.3 Input card

White, 1px border, radius 16, padding 24, `--shadow-card`.

**Info row:** left column holds "Free plan: Supports **5,000 words**! • Upgrade for 100,000 word support and high quiz count!" (13px; "Upgrade" is a primary-600 link, medium weight) with "Word Count: 0" beneath in primary-600 semibold 13px. Right side: translate icon + "Output Language:" label (ink-500, 13px) + compact select.

### 7.4 Tabs

- Row with icon (16px) + label, gap 8px, item padding 12px 16px, bottom border 1px on the whole row.
- **Active:** text primary-600 (600), 2px primary-600 underline overlapping the row border.
- **Inactive:** ink-500, hover ink-900.
- Tabs: Text, File, URL, YouTube (each with its own icon).

### 7.5 Textarea

- bg surface-alt (`#F8FAFC`), 1px border, radius 12, padding 16, min-height 240px, resize vertical.
- Placeholder: "Paste or type your content here..."
- **Focus:** border primary-600 + `0 0 0 3px rgba(79,70,229,0.15)` ring.
- **Error:** border `#EF4444` + red helper text below.

### 7.6 Ghost button (Clear Input)

Height 36, padding 0 12px, radius 8, 1px border, white bg, 13px 500 ink-700, trash icon 14px + 8px gap. Hover: bg `#F8FAFC`.

### 7.7 Toggle (Study Mode)

- Label: book/stack emoji or icon + "Study Mode" (13px 600 ink-900).
- Switch: 40x22 track, radius full, **off** = `#E2E8F0` with white knob; **on** = primary-600 with knob moved right.
- Status text ("Off" / "On") on the right, 13px ink-500.

### 7.8 Parameter card + select

- **Card:** white, 1px border, radius 12, padding 16.
- **Label:** 13px 600 ink-900, 8px below to the field.
- **Select:** height 42, bg surface-alt, 1px border, radius 8, padding 0 12px, 15px 500 text, right chevron icon (ink-500). Hover border `#CBD5E1`. Focus ring like textarea.
- **Default values:**
  - Question Type: "MCQ (Multiple Choice Questions)"
  - Question Count: "3 Questions"
  - Difficulty Level: "Medium"
  - MCQ Options Count: "4 Options (Standard A, B, C, D)"

### 7.9 Primary CTA (Generate Quiz)

- Full width, height **56px**, radius 16, primary gradient, `--shadow-cta`.
- Content: sparkle icon (20px, gold outline `#FBBF24`) + "Generate Quiz" (17px 600 white), centered, 10px gap.
- **Hover:** slight brighten + translateY(-1px). **Pressed:** translateY(0), darker gradient.
- **Disabled** (empty input): 50% opacity, no shadow, cursor not-allowed, label "Add content to generate".
- **Loading:** replace sparkle with a spinner, label "Generating your quiz...", button non-interactive.

---

## 8. Iconography

- Style: **outline line icons**, stroke 1.5 to 1.75px, rounded caps and joins (Lucide / Feather family).
- Sizes: 16px in nav, tabs, buttons; 20px for the CTA sparkle.
- Color inherits text color, except the gold sparkle.
- Suggested Lucide names: `home`, `layers`, `messages-square`, `image`, `image-plus`, `shuffle`, `video`, `newspaper`, `file-text`, `youtube`, `presentation`, `bookmark`, `user`, `search`, `languages`, `trash-2`, `zap`, `sparkles`, `chevron-down`.

---

## 9. Interaction & Motion

- Transitions: `150ms ease-out` for color, background, border and shadow changes.
- Hover lift on CTA only (1px). No bouncing or large motion.
- Focus-visible ring on every interactive element: `0 0 0 3px rgba(79,70,229,0.35)`.
- Skeleton or spinner for anything over 300ms; never a blank state.

---

## 10. Content & Voice

- Tone: clear, encouraging, concise. Avoid jargon.
- Button labels start with a verb: "Generate Quiz", "Upgrade", "Clear Input".
- Numbers use thousands separators (5,000).
- Every string must come from an i18n file (`en`, `tr`); leave room for longer Turkish text and never hard-code widths on labels.

**Key strings**

| Key | EN | TR (suggested) |
|---|---|---|
| `hero.title` | Generate different quizzes like MCQs, True or False, Fill-in-the-blanks, FAQs, etc using AI | MCQ, Doğru/Yanlış, Boşluk Doldurma, SSS ve daha fazlasını yapay zekâ ile oluşturun |
| `hero.subtitle` | Turn any study material, documentation, or lecture notes into interactive quizzes in seconds. | Her türlü ders materyalini, dokümanı veya ders notunu saniyeler içinde interaktif quizlere dönüştürün. |
| `cta.generate` | Generate Quiz | Quiz Oluştur |
| `params.eyebrow` | Quiz Parameters | Quiz Ayarları |

---

## 11. Accessibility

- Text contrast at least 4.5:1 (ink-500 `#64748B` on white passes for 15px+; do not use ink-400 for essential text).
- Active nav item: white on `#4F46E5` = passes AA.
- All icons paired with visible text, or given `aria-label`.
- Toggle uses `role="switch"` with `aria-checked`.
- Tabs use `role="tablist"` / `role="tab"` with arrow-key navigation.
- Minimum touch target 40x40px.
- Respect `prefers-reduced-motion`.

---

## 12. Design Tokens (copy-paste)

### 12.1 CSS variables

```css
:root {
  /* Color */
  --color-primary-50: #EEF2FF;
  --color-primary-600: #4F46E5;
  --color-primary-700: #4338CA;
  --color-blue-600: #2563EB;
  --color-success-500: #10B981;
  --color-success-600: #059669;
  --color-accent-gold: #F59E0B;
  --color-pro-bg: #FEF3C7;
  --color-pro-text: #92400E;

  --color-ink-900: #0F172A;
  --color-ink-700: #334155;
  --color-ink-600: #475569;
  --color-ink-500: #64748B;
  --color-ink-400: #94A3B8;
  --color-border: #E5E7EB;
  --color-surface: #FFFFFF;
  --color-surface-alt: #F8FAFC;
  --color-toggle-off: #E2E8F0;

  /* Gradients */
  --gradient-page: linear-gradient(135deg, #2563EB 0%, #3B4FDB 50%, #3730A3 100%);
  --gradient-primary: linear-gradient(90deg, #4F46E5 0%, #2563EB 100%);
  --gradient-avatar: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-active-nav: 0 4px 12px rgba(79, 70, 229, 0.25);
  --shadow-cta: 0 8px 20px rgba(79, 70, 229, 0.30);
  --shadow-app: 0 24px 60px rgba(15, 23, 42, 0.25);

  /* Type */
  --font-sans: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Layout */
  --sidebar-width: 256px;
  --topbar-height: 80px;
}
```

### 12.2 Tailwind config snippet

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { 50: "#EEF2FF", 600: "#4F46E5", 700: "#4338CA" },
        success: { 500: "#10B981", 600: "#059669" },
        ink: { 900: "#0F172A", 700: "#334155", 600: "#475569", 500: "#64748B", 400: "#94A3B8" },
        surface: { DEFAULT: "#FFFFFF", alt: "#F8FAFC" },
        gold: "#F59E0B",
      },
      fontFamily: { sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"] },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04)",
        nav: "0 4px 12px rgba(79,70,229,0.25)",
        cta: "0 8px 20px rgba(79,70,229,0.30)",
        app: "0 24px 60px rgba(15,23,42,0.25)",
      },
    },
  },
};
```

---

## 13. Do and Don't

**Do**
- Keep the gradient reserved for the primary CTA (and the logo mark).
- Use borders and whitespace to separate; keep shadows soft.
- Use indigo for "you are here / interactive", green only for upgrade/success, gold only for sparkle.
- Keep sidebar labels short (max 2 words in EN).

**Don't**
- Don't add third-party promos, founder contact lines or cross-app banners on the main screen.
- Don't introduce new accent colors (no red/orange decorative use; red is for errors only).
- Don't use more than one gradient button per screen.
- Don't set fixed pixel widths on text containers (Turkish will overflow).
- Don't use icon styles other than outline line icons.

---

## 14. Screen Inventory

| Screen | Status |
|---|---|
| Home / Generate Quiz | **Designed (this spec)** |
| Quiz result / editor | Not yet |
| Saved quizzes | Not yet |
| Account / billing (Upgrade) | Not yet |
| Landing page | Not yet |

New screens must reuse the tokens and components above; add new components to this file before using them.
