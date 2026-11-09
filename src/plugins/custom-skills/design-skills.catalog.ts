import type { DesignSkill } from "./design-skills.types";

export const AWESOME_DESIGN_SKILLS: DesignSkill[] = [
  {
    slug: "corporate",
    name: "Corporate Enterprise",
    subtitle: "Structured, accessible, and authoritative design system",
    description: "Designed for enterprise platforms, SaaS dashboards, and mission-critical business tools. Emphasizes visual hierarchy, WCAG AAA contrast, and predictable component behavior.",
    category: "UI Design",
    aesthetic: "Enterprise",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/corporate",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/corporate-marketing.png",
    palette: {
      primary: "#2563EB",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#0F172A",
      accent: "#0D9488",
      border: "#E2E8F0",
    },
    tokens: {
      fontFamily: "Inter, -apple-system, sans-serif",
      borderRadius: "6px",
      spacing: "8px baseline grid (8px, 16px, 24px, 32px)",
      shadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      borderWidth: "1px solid",
    },
    rules: [
      "Use strict 8pt baseline spacing throughout all layouts",
      "Buttons: 36px or 40px height with 6px border radius, clear text label",
      "Ensure WCAG 2.2 AA (4.5:1 text, 3:1 graphical elements) at all times",
      "Cards: crisp 1px #E2E8F0 border, white surface, subtle 0 1px 3px drop shadow",
      "Do NOT use decorative drop shadows or whimsical rounded pill shapes",
    ],
    content: `# Design System: Corporate Enterprise (SKILL.md)

## Role & Visual Direction
You are an expert Frontend Architect enforcing the **Corporate Enterprise** design system from awesome-design-skills. Every UI component and layout you output must exude institutional credibility, precision, and calm authority.

## Design Foundations & Tokens
- **Palette**:
  - Primary: #2563EB (Royal Blue 600)
  - Primary Hover: #1D4ED8
  - Background: #F8FAFC (Slate 50)
  - Surface / Cards: #FFFFFF
  - Headings & Text: #0F172A (Slate 900)
  - Secondary Text: #64748B (Slate 500)
  - Borders: #E2E8F0 (Slate 200)
  - Success: #16A34A | Warning: #D97706 | Danger: #DC2626
- **Typography**:
  - Font Stack: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
  - Heading Scale: H1 (32px / 700), H2 (24px / 600), H3 (18px / 600), Body (14px / 400), Caption (12px / 500)
- **Radii & Elevation**:
  - Border Radius: 6px standard (cards, buttons, inputs)
  - Elevation: Flat 1px border (#E2E8F0) + '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
- **Grid & Spacing**:
  - Strict 8pt scale: 8px (sm), 16px (md), 24px (lg), 32px (xl)

## Component Rules
1. **Buttons**:
   - Primary: background #2563EB, text #FFFFFF, font-weight 500, padding 8px 16px, radius 6px
   - Secondary: background #FFFFFF, border 1px solid #CBD5E1, text #0F172A
   - Focus state: outline 2px solid #2563EB with 2px offset
2. **Data Tables & Cards**:
   - Cards have header with divider line, subtle row hover (#F8FAFC)
   - Align numbers to the right, text to the left
3. **Forms**:
   - Input height 38px, font-size 14px, border 1px solid #CBD5E1, focus ring 2px #2563EB/20
   - Always display explicit persistent field labels above inputs

## Strict Do's & Don'ts
- DO maintain strict vertical rhythm and symmetrical padding.
- DO provide clear loading skeletons for data fetching.
- DON'T use pastel gradients, floating pill shapes, or exaggerated blurs.
- DON'T hide critical actions behind hover-only micro-interactions.`,
  },
  {
    slug: "glassmorphism",
    name: "Glassmorphism",
    subtitle: "Translucent frosted layers, specular highlights, and optical depth",
    description: "Multi-layered depth with dynamic blur, translucent surfaces, and refractive highlights. Ideal for modern ambient interfaces, creative tooling, and immersive web apps.",
    category: "UI Design",
    aesthetic: "Modern & Minimal",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/glassmorphism",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/glassmorphism-marketing.png",
    palette: {
      primary: "#8B5CF6",
      background: "#0F172A",
      surface: "rgba(255, 255, 255, 0.08)",
      text: "#F8FAFC",
      accent: "#38BDF8",
      border: "rgba(255, 255, 255, 0.16)",
    },
    tokens: {
      fontFamily: "Plus Jakarta Sans, SF Pro Display, sans-serif",
      borderRadius: "16px",
      spacing: "12px, 20px, 32px",
      shadow: "0 8px 32px 0 rgba(0, 0, 0, 0.36)",
      borderWidth: "1px specular highlight",
    },
    rules: [
      "Surfaces must use backdrop-filter: blur(16px) with translucent white/black overlay",
      "Borders are translucent (rgba(255,255,255,0.15)) with subtle top-to-bottom opacity gradient",
      "Place colorful glowing ambient gradient orbs behind the glass surfaces for depth refraction",
      "Ensure text contrast remains high (use #F8FAFC with text-shadow when over dynamic gradients)",
      "Border radius 16px to 24px with smooth curvature",
    ],
    content: `# Design System: Glassmorphism (SKILL.md)

## Role & Visual Direction
You are an expert UI Designer enforcing the **Glassmorphism** aesthetic from awesome-design-skills. All generated interfaces must embody optical depth, frosted glass translucency, specular highlights, and smooth light diffusion.

## Design Foundations & Tokens
- **Palette**:
  - Background: Deep slate #0F172A or obsidian #090D16 with colorful radial glow blobs (violet #8B5CF6 and cyan #38BDF8)
  - Glass Surface (Light mode): rgba(255, 255, 255, 0.65) with backdrop-filter: blur(16px)
  - Glass Surface (Dark mode): rgba(255, 255, 255, 0.08) with backdrop-filter: blur(16px)
  - Border Highlight: 1px solid rgba(255, 255, 255, 0.18)
  - Accent / CTA: Vibrant violet #8B5CF6 or electric cyan #38BDF8 with 0 0 20px rgba(139, 92, 246, 0.4)
- **Typography**:
  - Font Stack: "Plus Jakarta Sans", "SF Pro Display", sans-serif
  - Crisp anti-aliasing with letter-spacing -0.02em on headings
- **Radii & Elevation**:
  - Border Radius: 16px (standard cards), 12px (buttons), 24px (hero containers)
  - Elevation: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' with inner bevel highlight

## Component Rules
1. **Glass Cards**:
   - Class formula: 'bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl'
   - Add pseudo-element subtle gradient sheen for real glass refraction
2. **Buttons**:
   - Primary: 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 rounded-xl px-5 py-2.5 backdrop-blur'
   - Glass Secondary: 'bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl backdrop-blur'
3. **Modals & Flyouts**:
   - Stronger blur: backdrop-blur-2xl, saturated background, soft dark scrim

## Strict Do's & Don'ts
- DO layer translucent surfaces to create clear foreground / midground / background planes.
- DO verify legibility against complex gradient backdrops.
- DON'T use flat opaque gray backgrounds or harsh black borders.
- DON'T omit the 1px white border highlight; without it, glass turns to muddy fog.`,
  },
  {
    slug: "neobrutalism",
    name: "Neobrutalism",
    subtitle: "High-contrast black borders, hard offset drop shadows, and vivid pop colors",
    description: "Raw, energetic, and irreverent design language. Characterized by thick 2.5px solid black borders, hard non-blurred offset shadows, vibrant pop palettes, and bold geometric typography.",
    category: "UI Design",
    aesthetic: "Bold & Playful",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/neobrutalism",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/neobrutalism-marketing.png",
    palette: {
      primary: "#FFE600",
      background: "#FFFDF5",
      surface: "#FFFFFF",
      text: "#000000",
      accent: "#FF66C4",
      border: "#000000",
    },
    tokens: {
      fontFamily: "Space Grotesk, Archivo Black, JetBrains Mono, sans-serif",
      borderRadius: "4px",
      spacing: "12px, 20px, 28px",
      shadow: "4px 4px 0px #000000",
      borderWidth: "2.5px solid #000000",
    },
    rules: [
      "Every card, button, and input MUST have a solid 2px or 2.5px black border (#000)",
      "Drop shadows are hard and non-blurred: box-shadow: 4px 4px 0px #000 (translated on hover)",
      "On button click / active: translate by (2px, 2px) with shadow reduced to 2px 2px 0px #000",
      "Colors are hyper-saturated and punchy: canary yellow (#FFE600), hot pink (#FF66C4), mint (#00FFA3), cyan (#00F0FF)",
      "Never use soft gaussian blur shadows or gradient overlays",
    ],
    content: `# Design System: Neobrutalism (SKILL.md)

## Role & Visual Direction
You are an expert UI Engineer enforcing the **Neobrutalism** aesthetic from awesome-design-skills. All UI you generate must be daring, tactile, punchy, and instantly memorable, discarding corporate monotony in favor of high-contrast joy.

## Design Foundations & Tokens
- **Palette**:
  - Canvas: Cream white #FFFDF5 or warm canvas #FBF7EE
  - Pop Yellow: #FFE600 | Bubblegum Pink: #FF66C4 | Electric Cyan: #00F0FF | Mint: #00FFA3 | Tangerine: #FF7A00
  - Ink / Border: #000000 (Absolute Black)
  - Card Surface: #FFFFFF or tinted pop backgrounds
- **Borders & Shadows**:
  - Borders: 2px or 2.5px solid #000000
  - Shadows: '4px 4px 0px 0px #000000' (no blur!)
  - Interactive Hover: 'translate-x-[2px] translate-y-[2px] shadow-[2px_2px_0px_0px_#000]'
  - Active: 'translate-x-[4px] translate-y-[4px] shadow-none'
- **Typography**:
  - Font Stack: "Space Grotesk", "Archivo", "Syne", sans-serif
  - Monospace accents: "JetBrains Mono" for badges, stats, code
  - Bold, punchy weights (700/800) with generous tracking

## Component Rules
1. **Buttons**:
   - Class formula: 'bg-[#FFE600] text-black font-bold px-5 py-2.5 rounded border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] transition-all cursor-pointer'
2. **Cards**:
   - Class formula: 'bg-white p-6 rounded-md border-2 border-black shadow-[5px_5px_0px_0px_#000]'
3. **Tags & Badges**:
   - Class formula: 'px-2.5 py-0.5 text-xs font-mono font-bold uppercase rounded border-1.5 border-black bg-[#00FFA3] text-black shadow-[2px_2px_0px_#000]'
4. **Inputs**:
   - 'border-2 border-black p-3 font-mono text-sm focus:outline-none focus:bg-[#FFE600]/10 shadow-[3px_3px_0px_#000]'

## Strict Do's & Don'ts
- DO make interactive elements feel clickably tactile with hard mechanical press states.
- DO use bold uppercase badges with monospace typography.
- DON'T use blur shadows, smooth transition fades, or washed-out pastels.
- DON'T round corners past 6px; shapes should feel structural and geometric.`,
  },
  {
    slug: "paper",
    name: "Paper & Editorial",
    subtitle: "Warm tactile publication aesthetic with classical serif typography",
    description: "Inspired by literary journals, print typography, and high-end stationary. Features warm parchment tones, delicate borders, elegant serif headlines, and calm layout balance.",
    category: "UI Design",
    aesthetic: "Editorial & Tactile",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/paper",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/paper-marketing.png",
    palette: {
      primary: "#854D0E",
      background: "#FBF9F5",
      surface: "#FFFDF9",
      text: "#1C1917",
      accent: "#B45309",
      border: "#E7E2DA",
    },
    tokens: {
      fontFamily: "Newsreader, Merriweather, Georgia, serif (Headings); Inter (Body)",
      borderRadius: "3px",
      spacing: "16px, 24px, 40px",
      shadow: "0 1px 3px rgba(28, 25, 23, 0.04)",
      borderWidth: "1px hairline #E7E2DA",
    },
    rules: [
      "Background is warm parchment cream (#FBF9F5), never cold sterile blue-white (#FFFFFF)",
      "Headings use elegant editorial serif (Newsreader, Merriweather, Playfair)",
      "Borders are delicate warm hairlines: 1px solid #E7E2DA",
      "Generous line-height (1.7) and reading-optimized column widths (max-w-2xl to 3xl)",
      "Buttons feel like stamped ink or textured pressboard with muted earth tones",
    ],
    content: `# Design System: Paper & Editorial (SKILL.md)

## Role & Visual Direction
You are an expert Editorial Designer enforcing the **Paper** aesthetic from awesome-design-skills. All UI must feel thoughtfully printed, calming, and tactile—evoking the weight of fine paper, archival ink, and classical literature.

## Design Foundations & Tokens
- **Palette**:
  - Paper Canvas: #FBF9F5 (Warm Parchment)
  - Sheet Surface: #FFFDF9 (Off-white fiber)
  - Archival Ink: #1C1917 (Warm Charcoal 900)
  - Muted Charcoal: #57534E (Stone 600)
  - Paper Rule / Border: #E7E2DA (Warm Hairline)
  - Terracotta / Ochre Accent: #854D0E or #B45309
- **Typography**:
  - Headings: "Newsreader", "Merriweather", "Charter", "Georgia", serif
  - Body & UI: "Inter", "Source Serif", sans-serif / serif hybrid
  - Italicized callouts and drop-cap accents for literary depth
- **Radii & Surfaces**:
  - Border Radius: 2px or 3px (subtle sheet cut edge)
  - Elevation: Delicate print stamp '0 1px 2px rgba(28, 25, 23, 0.05)'

## Component Rules
1. **Paper Cards**:
   - 'bg-[#FFFDF9] border border-[#E7E2DA] p-6 rounded-[3px] shadow-[0_1px_2px_rgba(28,25,23,0.03)]'
2. **Buttons**:
   - Primary: 'bg-[#1C1917] hover:bg-[#292524] text-[#FBF9F5] font-serif px-5 py-2 rounded-[2px] transition-colors'
   - Secondary: 'bg-transparent border border-[#D6CEBE] text-[#1C1917] hover:bg-[#F5F0E6] font-serif px-5 py-2'
3. **Dividers**:
   - Thin 1px solid #E7E2DA, optionally centered with subtle ornament (e.g. '§' or diamond)

## Strict Do's & Don'ts
- DO prioritize readability with generous line height and warm tonal contrast.
- DO use serif typography for emotional and human connection.
- DON'T use pure black (#000000) or cold neon blues.
- DON'T use modern glass blurs, neon halos, or heavy drop shadows.`,
  },
  {
    slug: "bento",
    name: "Modern Bento Grid",
    subtitle: "Asymmetrical modular cards, micro-interactions, and dark elegance",
    description: "Inspired by Apple product pages, Linear, and modern SaaS showcase pages. Combines asymmetrical bento layouts, deep rounded corners, dark matte surfaces, and focused micro-interactions.",
    category: "UI Design",
    aesthetic: "Modern & Minimal",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/bento",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/bento-marketing.png",
    palette: {
      primary: "#3B82F6",
      background: "#090A0F",
      surface: "#12141C",
      text: "#EDEDF0",
      accent: "#10B981",
      border: "rgba(255, 255, 255, 0.08)",
    },
    tokens: {
      fontFamily: "Geist, Inter, SF Pro Display, sans-serif",
      borderRadius: "20px",
      spacing: "16px grid gap, 24px card padding",
      shadow: "0 4px 24px -1px rgba(0, 0, 0, 0.5)",
      borderWidth: "1px hairline rgba(255, 255, 255, 0.08)",
    },
    rules: [
      "Layouts use CSS Grid with spanning cards (e.g. col-span-2 row-span-1, col-span-1 row-span-2)",
      "Cards have deep rounded corners (rounded-2xl / rounded-3xl, 20px - 24px)",
      "Dark matte finish: #12141C surface with subtle 1px border rgba(255,255,255,0.08)",
      "Cards contain purposeful micro-visuals: animated badges, mini graphs, telemetry pills",
      "Subtle spotlight hover gradient or radial highlight centered under cursor",
    ],
    content: `# Design System: Modern Bento Grid (SKILL.md)

## Role & Visual Direction
You are an expert Frontend Architect enforcing the **Bento Grid** design system from awesome-design-skills. All dashboards, landing pages, and component groups must be organized into balanced, asymmetrical bento cells with dark mode elegance and crisp information density.

## Design Foundations & Tokens
- **Palette**:
  - Background: #090A0F (Deep Obsidian)
  - Cell Surface: #12141C with optional subtle gradient mask
  - Hairline Border: 1px solid rgba(255, 255, 255, 0.08)
  - Typography: #EDEDF0 (Primary) and #8A8F9E (Muted)
  - Accents: Electric Blue #3B82F6, Emerald #10B981, Amber #F59E0B
- **Typography**:
  - Font: "Geist", "Inter", -apple-system, sans-serif
  - Tight tracking (-0.03em) on display numerals and titles
- **Grid Structure**:
  - 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[220px]'
  - Featured items span 2 columns or 2 rows to create visual interest

## Component Rules
1. **Bento Card**:
   - 'relative overflow-hidden bg-[#12141C] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between hover:border-white/[0.16] transition-all'
   - Internal top: category pill + icon; Middle: hero metric / chart; Bottom: title + caption
2. **Spotlight Effect**:
   - Radial gradient overlay 'pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition duration-300'
3. **Pills & Micro-Badges**:
   - 'px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/[0.06] text-white/80 border border-white/[0.08]'

## Strict Do's & Don'ts
- DO vary cell dimensions (1x1, 2x1, 1x2, 2x2) to create rhythmic scanning flow.
- DO ensure each bento cell has a distinct visual anchor (icon, badge, graph, or button).
- DON'T create uniform, identical 1x1 grid boxes that look like a table.
- DON'T use busy multi-color background patterns.`,
  },
  {
    slug: "minimal",
    name: "Minimalist Stark",
    subtitle: "Monochrome purity, intentional whitespace, and zero decoration",
    description: "Maximum functional clarity. Eliminates visual clutter, unnecessary borders, and decorative chrome, letting pristine typography, high contrast, and generous whitespace carry the interface.",
    category: "UI Design",
    aesthetic: "Minimal & Clean",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/minimal",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/minimal-marketing.png",
    palette: {
      primary: "#18181B",
      background: "#FAFAFA",
      surface: "#FFFFFF",
      text: "#09090B",
      accent: "#52525B",
      border: "#E4E4E7",
    },
    tokens: {
      fontFamily: "Geist, Helvetica Neue, -apple-system, sans-serif",
      borderRadius: "4px",
      spacing: "16px, 32px, 48px, 64px",
      shadow: "none",
      borderWidth: "1px solid #E4E4E7",
    },
    rules: [
      "Strict monochrome palette: Pure white, subtle zinc-50 background, deep zinc-950 text",
      "No colored drop shadows, decorative icons, or ornamental cards",
      "Rely on generous whitespace (padding 32px to 64px) to separate functional sections",
      "Single decisive accent state: inverted background (black on white or white on black)",
      "Typography must carry the hierarchy through scale and weight alone",
    ],
    content: `# Design System: Minimalist Stark (SKILL.md)

## Role & Visual Direction
You are an expert Designer enforcing the **Minimalist Stark** aesthetic from awesome-design-skills. All components must ruthlessly strip away unnecessary chrome, decorations, and arbitrary color, achieving supreme clarity through proportion, rhythm, and silence.

## Design Foundations & Tokens
- **Palette**:
  - Canvas: #FAFAFA (Zinc 50) | Dark: #09090B (Zinc 950)
  - Surface: #FFFFFF | Dark: #121215
  - Primary Ink: #09090B | Dark: #FAFAFA
  - Secondary Ink: #71717A (Zinc 500)
  - Border: 1px solid #E4E4E7 (Zinc 200) | Dark: #27272A (Zinc 800)
- **Typography**:
  - Font Stack: "Geist", "Helvetica Neue", -apple-system, sans-serif
  - Unadorned, high legibility, strict typographic scale (48px, 24px, 14px, 12px)
- **Layout & Rhythm**:
  - Zero shadows. Separation achieved via 1px border or whitespace gaps.
  - Border Radius: Minimal 2px to 4px.

## Component Rules
1. **Buttons**:
   - Primary: 'bg-black text-white hover:bg-zinc-800 text-xs uppercase tracking-wider font-medium px-4 py-2 rounded-sm transition-colors'
   - Outline: 'bg-transparent border border-zinc-300 text-black hover:border-black text-xs uppercase tracking-wider px-4 py-2 rounded-sm'
2. **Sections & Containers**:
   - 'py-12 md:py-20 border-b border-zinc-200'
3. **Forms**:
   - Clean underlined or 1px bordered inputs with zero drop shadow: 'border-b border-zinc-300 focus:border-black rounded-none bg-transparent py-2 text-sm'

## Strict Do's & Don'ts
- DO let white space do the work that borders and colored backgrounds usually do.
- DO align all elements to a strict geometric grid.
- DON'T add decorative emojis, illustrations, or multi-color badges.
- DON'T use rounded pill buttons or colored gradients.`,
  },
  {
    slug: "cyberpunk",
    name: "Cyberpunk & Neon HUD",
    subtitle: "High-tech terminal HUD, neon edge glows, and sci-fi telemetry",
    description: "Futuristic telemetry heads-up display. Features deep obsidian backgrounds, glowing cyan and hot magenta borders, angular cut corners, monospace telemetry streams, and scanning lines.",
    category: "UI Design",
    aesthetic: "Dark & Futuristic",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/cyberpunk",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/neon-marketing.png",
    palette: {
      primary: "#00F0FF",
      background: "#080B10",
      surface: "#0D111A",
      text: "#E2F1FF",
      accent: "#FF0055",
      border: "#00F0FF",
    },
    tokens: {
      fontFamily: "JetBrains Mono, Orbitron, Space Mono, monospace",
      borderRadius: "2px or 45deg chamfered clip-path",
      spacing: "12px, 18px, 28px",
      shadow: "0 0 16px rgba(0, 240, 255, 0.35)",
      borderWidth: "1px solid #00F0FF",
    },
    rules: [
      "Background is pitch space-black (#080B10) with subtle tech grid overlay",
      "Glowing neon accents: Electric Cyan (#00F0FF) and Laser Magenta (#FF0055)",
      "Monospace telemetry data labels, system status indicators [SYS.OK], hex coordinates",
      "Borders glow with box-shadow: 0 0 12px rgba(0, 240, 255, 0.3)",
      "Buttons feature sharp angular cuts or bracket-style borders: [ ENTER_DATA ]",
    ],
    content: `# Design System: Cyberpunk & Neon HUD (SKILL.md)

## Role & Visual Direction
You are an expert Sci-Fi Interface Engineer enforcing the **Cyberpunk & Neon HUD** design system from awesome-design-skills. All UI you generate must evoke a military-grade cyberdeck, tactical HUD, or orbital telemetry station.

## Design Foundations & Tokens
- **Palette**:
  - Chassis Canvas: #080B10 (Obsidian Void)
  - Pod Surface: #0D111A (Hard Slate)
  - Cyan Laser: #00F0FF (Primary glow: 0 0 15px rgba(0, 240, 255, 0.4))
  - Magenta Laser: #FF0055 (Secondary alert: 0 0 15px rgba(255, 0, 85, 0.4))
  - Amber Warning: #FFB800 | Matrix Green: #00FF66
  - Typography: #E2F1FF (Glow White)
- **Typography**:
  - Font: "JetBrains Mono", "Space Mono", "Orbitron", monospace
  - Uppercase headings with technical indices: '01 // TELEMETRY_STREAM'
- **Shapes & Effects**:
  - Chamfered corners (clip-path polygon) or sharp 2px borders
  - Scanline effect or 1px technical corner crosshairs '+'

## Component Rules
1. **HUD Buttons**:
   - 'bg-[#00F0FF]/10 border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF] hover:text-black font-mono font-bold tracking-widest text-xs px-5 py-2.5 uppercase shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all'
2. **Tactical Cards**:
   - 'relative bg-[#0D111A] border border-[#00F0FF]/30 p-5 shadow-[0_0_20px_rgba(0,240,255,0.1)] before:absolute before:top-0 before:left-0 before:w-2 before:h-2 before:border-t-2 before:border-l-2 before:border-[#00F0FF]'
3. **Telemetry Pills**:
   - '[STATUS: ONLINE]' in glowing green monospace with a pulsing beacon dot

## Strict Do's & Don'ts
- DO include technical indexing, timestamps, and bracketed microcopy.
- DO make neon borders glow against dark slate backgrounds.
- DON'T use soft pastel tones, bubbly 20px rounded pill buttons, or light gray cards.
- DON'T use casual conversational copywriting; keep copy crisp and technical.`,
  },
  {
    slug: "material",
    name: "Material Design 3",
    subtitle: "Google M3 elevation, tonal color roles, and pill-shaped interactive surfaces",
    description: "Modern implementation of Google Material Design 3 (Material You). Built on dynamic tonal palettes, systematic surface elevations, rounded pill buttons, and responsive touch ripple targets.",
    category: "UI Design",
    aesthetic: "Enterprise",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/material",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/material-marketing.png",
    palette: {
      primary: "#6750A4",
      background: "#FEF7FF",
      surface: "#F7F2FA",
      text: "#1D1B20",
      accent: "#7D5260",
      border: "#CAC4D0",
    },
    tokens: {
      fontFamily: "Roboto, Google Sans, sans-serif",
      borderRadius: "16px (cards), 9999px (pill buttons)",
      spacing: "4px, 8px, 16px, 24px",
      shadow: "0 1px 3px 1px rgba(0, 0, 0, 0.15)",
      borderWidth: "0px (relies on tonal elevation) or 1px outline",
    },
    rules: [
      "Color roles: Primary, On-Primary, Surface, Surface-Variant, Outline",
      "Buttons are fully rounded pill shapes: rounded-full (height 40px)",
      "Elevation levels 1 through 5 control shadow diffusion and surface color tinting",
      "Cards have soft rounded corners (rounded-2xl / 16px) with tonal container fills",
      "Interactive components support clear ripple/state-layer hover tints",
    ],
    content: `# Design System: Material Design 3 (SKILL.md)

## Role & Visual Direction
You are an expert Frontend Architect enforcing Google's **Material Design 3 (M3)** from awesome-design-skills. All components must reflect the Material You philosophy: tonal color roles, full-pill interactive elements, systematic surface elevations, and adaptive layouts.

## Design Foundations & Tokens
- **Palette**:
  - Primary: #6750A4 (M3 Purple 80)
  - On-Primary: #FFFFFF
  - Primary Container: #EADDFF (Tonal lavender)
  - Surface: #FEF7FF (Surface Level 0)
  - Surface Container: #F3EDF7 (Surface Level 2)
  - Outline: #79747E | Outline Variant: #CAC4D0
  - Text / On-Surface: #1D1B20
- **Typography**:
  - Font: "Roboto", "Google Sans", sans-serif
  - Headline (32px / 400), Title Medium (16px / 500), Body Large (16px / 400), Label Large (14px / 500)
- **Radii & Elevation**:
  - Pill Buttons: rounded-full (9999px)
  - Cards: rounded-2xl (16px) | Dialogs: rounded-3xl (28px)
  - Elevation 1: '0 1px 3px 1px rgba(0,0,0,0.15), 0 1px 2px 0 rgba(0,0,0,0.30)'
  - Elevation 3: '0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px 0 rgba(0,0,0,0.30)'

## Component Rules
1. **Filled Button**:
   - 'bg-[#6750A4] text-white hover:bg-[#6750A4]/90 rounded-full px-6 py-2.5 font-medium text-sm shadow-sm transition-all'
2. **Tonal Button**:
   - 'bg-[#EADDFF] text-[#21005D] hover:bg-[#EADDFF]/80 rounded-full px-6 py-2.5 font-medium text-sm'
3. **Elevated Card**:
   - 'bg-[#F3EDF7] rounded-2xl p-6 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15)] text-[#1D1B20]'

## Strict Do's & Don'ts
- DO use pill-shaped containers for buttons and interactive filter chips.
- DO use tonal container backgrounds rather than heavy border outlines.
- DON'T use sharp 0px or 2px rectangle buttons.
- DON'T use pure black (#000000) drop shadows without elevation tinting.`,
  },
  {
    slug: "dithered",
    name: "Retro 8-bit & Dithered",
    subtitle: "Dither dot gradients, bitmap pixel fonts, and early digital nostalgia",
    description: "Early personal computing and retro gaming aesthetic. Features dithered cross-hatch gradients, crisp aliased 1-bit or amber phosphor color palettes, pixel art accents, and tactile physical buttons.",
    category: "UI Design",
    aesthetic: "Retro & Digital",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/dithered",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/dithered-marketing.png",
    palette: {
      primary: "#00AA00",
      background: "#1A1A1A",
      surface: "#2D2D2D",
      text: "#E0E0E0",
      accent: "#FFCC00",
      border: "#555555",
    },
    tokens: {
      fontFamily: "VT323, Silkscreen, monospace",
      borderRadius: "0px (strictly sharp)",
      spacing: "8px, 16px, 24px",
      shadow: "inset 2px 2px 0px #FFF, inset -2px -2px 0px #000",
      borderWidth: "2px solid",
    },
    rules: [
      "Zero border radius: every element has crisp, pixel-perfect 0px corners",
      "Use dither dot patterns or checkered backgrounds to simulate gradients",
      "Buttons use retro bevel insets: border-t-white border-l-white border-r-black border-b-black",
      "Monospace or pixel typography for headers, metrics, and interactive labels",
      "Active pressed buttons invert top/bottom bevels to create mechanical tactile sink",
    ],
    content: `# Design System: Retro 8-bit & Dithered (SKILL.md)

## Role & Visual Direction
You are an expert Retro Computing Interface Designer enforcing the **8-bit & Dithered** design system from awesome-design-skills. All components must evoke 1980s personal computing (Macintosh System 1, Commodore, DOS, GameBoy).

## Design Foundations & Tokens
- **Palette**:
  - Screen Background: #1A1A1A or Amber #281D00 or Classic Gray #C0C0C0
  - Pixel Ink: #E0E0E0 or Matrix Green #00FF66 or Amber #FFB000
  - Window Bevel: High #FFFFFF, Low #000000, Face #C0C0C0
- **Borders & Insets**:
  - Border Radius: STRICTLY 0px. No rounded corners anywhere!
  - Classic 3D Bevel Button:
    - Normal: 'border-2 border-t-white border-l-white border-r-black border-b-black bg-[#C0C0C0] text-black'
    - Pressed: 'border-2 border-t-black border-l-black border-r-white border-b-white bg-[#A0A0A0]'
- **Typography**:
  - Font: "VT323", "Silkscreen", "Courier", monospace
  - Render with aliased, crisp rendering ('font-smooth: never')

## Component Rules
1. **Window Frame**:
   - 'border-2 border-black bg-[#C0C0C0] p-1 shadow-[3px_3px_0px_#000]'
   - Header bar with horizontal striped lines and square close box '[X]'
2. **Dither Pattern**:
   - Background checkered pattern: 'background-image: radial-gradient(#333 1px, transparent 0); background-size: 4px 4px;'

## Strict Do's & Don'ts
- DO keep all corners strictly 0px sharp.
- DO use classic beveled button frames with sunken click states.
- DON'T use modern anti-aliased blur shadows or rounded corners.
- DON'T use smooth animated transitions; state switches should be immediate.`,
  },
  {
    slug: "doodle",
    name: "Playful Doodle",
    subtitle: "Organic squiggly borders, hand-drawn sketch icons, and friendly warmth",
    description: "Breaks away from rigid geometric grids with organic hand-drawn borders, sketch lines, highlighter pastel accents, and friendly warmth. Perfect for creative brainstorming, indie apps, and education.",
    category: "UI Design",
    aesthetic: "Bold & Playful",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/doodle",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/doodle-marketing.png",
    palette: {
      primary: "#2563EB",
      background: "#FFFDF0",
      surface: "#FFFFFF",
      text: "#1E293B",
      accent: "#F43F5E",
      border: "#1E293B",
    },
    tokens: {
      fontFamily: "Comic Neue, Caveat, Patrick Hand, sans-serif",
      borderRadius: "255px 15px 225px 15px/15px 225px 15px 255px (organic wobbly)",
      spacing: "12px, 20px, 32px",
      shadow: "3px 3px 0px rgba(30, 41, 59, 0.8)",
      borderWidth: "2px solid #1E293B",
    },
    rules: [
      "Use organic wobbly border radius for buttons and cards",
      "Sketch lines: 2px solid dark charcoal border with slight natural asymmetry",
      "Warm paper cream background (#FFFDF0) with highlighter pastel markers (yellow, pink, mint)",
      "Badges look like hand-drawn stickers with gentle rotation (-2deg to +2deg)",
      "Casual, friendly, supportive voice and tone",
    ],
    content: `# Design System: Playful Doodle (SKILL.md)

## Role & Visual Direction
You are an expert Creative Interface Designer enforcing the **Playful Doodle** design system from awesome-design-skills. All UI must feel sketch-like, approachable, human, and delightfully organic.

## Design Foundations & Tokens
- **Palette**:
  - Sketch Paper: #FFFDF0 (Warm Notebook Cream)
  - Sketch Charcoal: #1E293B
  - Highlighter Yellow: #FEF08A | Highlighter Pink: #FECDD3 | Mint: #A7F3D0
  - Primary Ink: #2563EB (Ballpoint Blue)
- **Organic Border Radius**:
  - 'border-radius: 255px 15px 225px 15px/15px 225px 15px 255px'
  - Slightly wobbly, non-symmetrical borders that feel drawn with a pen
- **Typography**:
  - Font: "Comic Neue", "Caveat", "Patrick Hand", sans-serif

## Component Rules
1. **Doodle Button**:
   - 'border-2 border-[#1E293B] bg-[#FEF08A] text-[#1E293B] font-bold px-5 py-2.5 rounded-[255px_15px_225px_15px/15px_225px_15px_255px] shadow-[3px_3px_0px_#1E293B] hover:rotate-1 active:scale-95 transition-all'
2. **Sticker Card**:
   - 'bg-white border-2 border-[#1E293B] rounded-[20px_4px_18px_6px/4px_18px_6px_20px] p-6 shadow-[4px_4px_0px_#1E293B]'

## Strict Do's & Don'ts
- DO give buttons and cards subtle organic rotations (-1deg, +1.5deg).
- DO highlight key words with pastel background marker blocks.
- DON'T use cold corporate gray layouts or sterile symmetrical glass blurs.`,
  },
  {
    slug: "skeuomorphic",
    name: "Modern Skeuomorphism",
    subtitle: "Tactile depth, extruded physical buttons, and embossed metallic finishes",
    description: "Reinvented skeuomorphism for modern screens. Utilizes multi-stop gradient fills, extruded 3D push-down buttons, inner bevel highlights, and soft realistic ambient drop shadows.",
    category: "UI Design",
    aesthetic: "Editorial & Tactile",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/skeuomorphic",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/skeumorphism-marketing.png",
    palette: {
      primary: "#3B82F6",
      background: "#E5E7EB",
      surface: "#F3F4F6",
      text: "#1F2937",
      accent: "#10B981",
      border: "#D1D5DB",
    },
    tokens: {
      fontFamily: "SF Pro, Inter, sans-serif",
      borderRadius: "10px",
      spacing: "12px, 20px, 32px",
      shadow: "0 4px 6px -1px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.7)",
      borderWidth: "1px solid #D1D5DB",
    },
    rules: [
      "Buttons must look like physical extruded switches with top highlight and bottom shadow",
      "Active button state: inset shadow (shadow-inner) with 1px downward translation",
      "Surfaces feature subtle linear gradients from 5% lighter at top to 5% darker at bottom",
      "Cards have soft bevels: inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      "High visual tactile appeal that makes users want to press the screen",
    ],
    content: `# Design System: Modern Skeuomorphism (SKILL.md)

## Role & Visual Direction
You are an expert Tactile Interface Designer enforcing the **Modern Skeuomorphism** design system from awesome-design-skills. All UI elements must possess tangible physical weight, realistic light reflection, and satisfying mechanical press depth.

## Design Foundations & Tokens
- **Palette**:
  - Workbench Surface: #E5E7EB to #F3F4F6
  - Card Plate: #F9FAFB with subtle top-to-bottom gradient
  - Border Rim: #D1D5DB with top specular white highlight
  - Extruded Shadow: '0 4px 6px -1px rgba(0,0,0,0.15), 0 2px 4px -2px rgba(0,0,0,0.1)'
  - Pressed Inset: 'inset 0 2px 4px 0 rgba(0,0,0,0.25)'

## Component Rules
1. **Extruded 3D Button**:
   - 'bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white font-medium px-5 py-2.5 rounded-lg shadow-[0_4px_0_#1d4ed8,0_5px_8px_rgba(0,0,0,0.2)] active:translate-y-[3px] active:shadow-[0_1px_0_#1d4ed8] transition-all'
2. **Molded Surface Card**:
   - 'bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-xl p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1)]'

## Strict Do's & Don'ts
- DO simulate light source coming from the top (top highlight, bottom shadow).
- DO make buttons visibly depress on active press.
- DON'T use flat 1-color rectangles with zero depth.`,
  },
  {
    slug: "terminal",
    name: "CLI & Hacker Terminal",
    subtitle: "Phosphor matrix green on pitch black, ASCII box-drawing, and shell commands",
    description: "Classic Unix terminal interface. Built with phosphor green or amber monospace characters on pitch-black canvas, ASCII box-drawing characters (┌─┐└─┘), command prompts ($ > _), and status pills.",
    category: "UI Design",
    aesthetic: "Retro & Digital",
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: "https://github.com/bergside/awesome-design-skills/tree/main/skills/terminal",
    image_url: "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/matrix-marketing.png",
    palette: {
      primary: "#22C55E",
      background: "#0A0A0A",
      surface: "#141414",
      text: "#22C55E",
      accent: "#EAB308",
      border: "#22C55E",
    },
    tokens: {
      fontFamily: "Fira Code, JetBrains Mono, Courier, monospace",
      borderRadius: "0px (pure rectangular)",
      spacing: "8px, 16px, 24px",
      shadow: "0 0 10px rgba(34, 197, 94, 0.2)",
      borderWidth: "1px solid #22C55E",
    },
    rules: [
      "Pure pitch-black background (#0A0A0A) with phosphor green (#22C55E) or amber (#EAB308)",
      "Strict monospace font for every single string of text, button, and header",
      "Use ASCII box-drawing elements for cards and headers: ┌────────┐ │ STATUS │ └────────┘",
      "Prompts prefixed with '$ ' or '> ' with blinking cursor motif",
      "Buttons look like bracketed commands: [ EXECUTE ] [ REBOOT ]",
    ],
    content: `# Design System: CLI & Hacker Terminal (SKILL.md)

## Role & Visual Direction
You are an expert Terminal Systems Architect enforcing the **CLI & Hacker Terminal** design system from awesome-design-skills. All UI you generate must read as a high-density, authoritative Unix shell or mainframe terminal.

## Design Foundations & Tokens
- **Palette**:
  - CRT Screen: #0A0A0A (Pure Terminal Void)
  - Phosphor Green: #22C55E (Default) | Phosphor Amber: #F59E0B (Alternative)
  - Inactive Muted: #15803D (Green 700)
  - Card Panel: #141414 with 1px solid #22C55E/40
- **Typography & Grid**:
  - Font Stack: "Fira Code", "JetBrains Mono", "Courier New", monospace
  - Crisp letterforms with monospace column alignment

## Component Rules
1. **Bracketed Command Button**:
   - 'bg-black border border-[#22C55E] text-[#22C55E] hover:bg-[#22C55E] hover:text-black font-mono text-xs px-4 py-2 uppercase shadow-[0_0_8px_rgba(34,197,94,0.3)] transition-colors'
2. **Terminal Window Card**:
   - 'bg-[#141414] border border-[#22C55E]/40 p-4 font-mono text-[#22C55E] before:content-["[TTY_01]"] before:block before:text-xs before:text-[#22C55E]/60 before:mb-2'
3. **Prompt Input**:
   - 'bg-transparent border-b border-[#22C55E] text-[#22C55E] font-mono p-2 focus:outline-none focus:shadow-[0_0_10px_rgba(34,197,94,0.3)]'

## Strict Do's & Don'ts
- DO use monospace typography for every single UI element.
- DO incorporate shell-like indicators ($ command, > prompt).
- DON'T use sans-serif fonts, rounded pill buttons, or multi-color pastel gradients.`,
  },
];
