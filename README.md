# Fractor Tractor

The digital home for your trading card game collection — Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Lorcana and more. Organize, verify, value, and share — all in one place.

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
├── support.html       # Support ticket form + help centre
├── privacy.html       # Privacy policy
├── terms.html         # Terms of service
├── css/
│   └── style.css      # Global stylesheet
├── js/
│   └── main.js        # Shared JavaScript
├── functions/
│   └── api/
│       └── support.js # Cloudflare Pages Function — support ticket delivery
└── images/            # Static assets
```

## Support Ticket Delivery

`support.html` posts to `/api/support`, a Cloudflare Pages Function that emails
the ticket to the support inbox. The page only shows a "ticket sent"
confirmation when the mail provider has actually accepted the message; if
delivery is unconfigured or failing it shows an error and offers a prefilled
`mailto:` fallback instead.

Set these in **Cloudflare Pages → Settings → Environment variables**:

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | API key from [resend.com](https://resend.com); store as an encrypted secret |
| `SUPPORT_FROM` | yes | Verified sender, e.g. `Fractor Tractor Support <support@fractortractor.com>` |
| `SUPPORT_TO` | no | Destination inbox (defaults to `albert@trimultaneously.com`) |

Until those are set the endpoint returns `503 not_configured` by design.

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
