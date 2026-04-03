# Fractor Tractor

The digital home for your sports card and trading card collection. Organize, verify, value, and share — all in one place.

## Tech Stack

- **HTML / CSS / JavaScript** — no build tools, no frameworks
- **Cloudflare Pages** — hosting and CDN
- **Inter** — typography via Google Fonts

## Project Structure

```
fractor-tractor-site/
├── index.html         # Landing / home page
├── features.html      # Features overview
├── pricing.html       # Pricing plans
├── about.html         # About / company story
├── contact.html       # Contact form + info
├── privacy.html       # Privacy policy
├── css/
│   └── style.css      # Global stylesheet
├── js/
│   └── main.js        # Shared JavaScript
└── images/            # Static assets
```

## Local Development

Just open any `.html` file in your browser, or run a local server:

```bash
npx serve .
```

## Deployment

This site is deployed via **Cloudflare Pages**, connected to this GitHub repo. Every push to `main` triggers an automatic deployment.

**Build settings in Cloudflare Pages:**
- Build command: *(none — static site)*
- Build output directory: `/`

## Operated By

**Trimultaneously LLC**
[fractortractor.com](https://fractortractor.com)
