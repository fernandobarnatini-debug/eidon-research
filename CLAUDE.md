# CLAUDE.md — Frontend Website Rules

## Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.
- Read `brand_assets/brand-guidelines.md` for colors, typography, and brand voice.
- Read `products.md` for all product data, pricing, bundles, FAQ, shipping, and payment info.

## Reference Images
- A reference screenshot is in `reference/onyx-screenshot.png` (onyxresearch.shop — a peptide research store).
- Match the layout, spacing, and structure. Clone the STRUCTURE — announcement bar, nav, hero, trust bar, product grid, bundles, FAQ, footer.
- Use EIDON branding from `brand_assets/` — NOT the reference site's branding.
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

## Local Server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `npx serve .` or `python3 -m http.server 3000`
- If the server is already running, do not start a second instance.

## Screenshot Workflow
- Install Puppeteer if needed: `npm install puppeteer`
- **Always screenshot from localhost**
- Screenshots are saved to `./temporary_screenshots/` (auto-create if needed).
- After screenshotting, read the PNG with the Read tool — Claude can see and analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing
- **Exception:** For animated backgrounds or dynamic elements, skip screenshot comparison.

## Output Defaults
- Single `index.html` file + `checkout.html`, all styles inline, unless user says otherwise
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive

## Brand Assets
- Always check the `brand_assets/` folder before designing. It contains brand guidelines and may contain a logo.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values — do not invent brand colors.

## Anti-Generic Guardrails
- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Use EIDON brand colors from brand guidelines.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never use the same font for headings and body. Use "DM Sans" for headings, system sans-serif for body. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Add a gradient overlay (`bg-gradient-to-t from-black/60`) and a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not all sit at the same z-plane.

## Hard Rules
- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it, then apply EIDON branding
- Do not stop after one screenshot pass
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color
- Must look like a REAL professional store — NOT an AI-generated landing page
- White/light backgrounds for main content areas — dark backgrounds for header/footer only

## EIDON-Specific

### Brand
- **Name:** EIDON Research
- **Tagline:** "Become the Form God Intended"
- **Colors:** Navy #0B1426, Gold #D4AF37 (sparingly), Electric Blue #00D4FF (rare accent), White #FFFFFF, Off-white #f8f9fa

### Payment (TWO methods only)
1. **Zelle** — Primary manual payment method. Customer sends Zelle, order saved as PENDING_VERIFICATION for admin review.
2. **Crypto** — Coinbase Commerce for Bitcoin/Ethereum. Customers paying crypto get **5% off** entire order. Show discounted total when crypto is selected.
- After payment, show confirmation screen with order number and details.

### Cart System
- Floating cart icon in nav with count badge
- Slide-out cart drawer
- Add/remove, quantity +/-, real-time subtotal
- Persists via localStorage key `eidon_cart`
- "Checkout" button → checkout.html

### Legal (CRITICAL — peptide industry)
Every page must include:
- "Products are for research use only. Not for human consumption."
- FDA disclaimer in footer
- "Must be 18+ to order"
- "Not intended to diagnose, treat, cure, or prevent any disease"
- NEVER use words like "inject," "dose," "cycle," "pharmacy," "medication"
