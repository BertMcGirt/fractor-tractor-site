/**
 * POST /api/support — receive a support ticket and deliver it to the support inbox.
 *
 * Cloudflare Pages picks this up automatically from the functions/ directory;
 * the rest of the site stays a plain static build with no toolchain.
 *
 * Environment variables (Cloudflare dashboard → Pages → Settings → Environment variables):
 *   RESEND_API_KEY  (required, encrypted)  API key from resend.com
 *   SUPPORT_FROM    (required)             Verified sender, e.g. "Fractor Tractor Support <support@fractortractor.com>"
 *   SUPPORT_TO      (optional)             Destination inbox, defaults to albert@trimultaneously.com
 *
 * This endpoint returns 200 { ok: true } ONLY after the mail provider has
 * accepted the message, so the confirmation the user sees is never a claim we
 * can't back up. Every other outcome returns an error the page surfaces along
 * with a mailto fallback.
 */

const DEFAULT_SUPPORT_TO = 'albert@trimultaneously.com';

const CATEGORIES = [
  'Account & Login',
  'Billing & Subscription',
  'Card Verification',
  'Card Data & Pricing',
  'Bug Report',
  'Feature Request',
  'Privacy Request',
  'Other',
];

const LIMITS = { name: 100, email: 200, subject: 150, message: 5000, appVersion: 50 };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Ticket reference like FT-7Q2K4M — no vowels or look-alike characters. */
function makeTicketId() {
  const alphabet = '23456789BCDFGHJKLMNPQRSTVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return 'FT-' + id;
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

async function handleSubmission(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request', message: 'Could not read the submitted form.' }, 400);
  }

  // Honeypot: a real person never fills this hidden field in.
  if (clean(payload.company, 100)) {
    return json({ ok: false, error: 'rejected', message: 'Submission rejected.' }, 400);
  }

  const name = clean(payload.name, LIMITS.name);
  const email = clean(payload.email, LIMITS.email);
  const subject = clean(payload.subject, LIMITS.subject);
  const message = clean(payload.message, LIMITS.message);
  const appVersion = clean(payload.appVersion, LIMITS.appVersion);
  const rawCategory = clean(payload.category, 60);
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'Other';

  if (!name || !email || !subject || !message) {
    return json(
      { ok: false, error: 'missing_fields', message: 'Please fill in your name, email, subject, and description.' },
      400,
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'invalid_email', message: 'That email address doesn\'t look right.' }, 400);
  }

  const apiKey = env.RESEND_API_KEY;
  const from = env.SUPPORT_FROM;
  const to = env.SUPPORT_TO || DEFAULT_SUPPORT_TO;

  if (!apiKey || !from) {
    // Not configured yet — say so plainly rather than pretending the ticket landed.
    return json(
      {
        ok: false,
        error: 'not_configured',
        message: 'Ticket delivery isn\'t configured on this environment yet.',
      },
      503,
    );
  }

  const ticketId = makeTicketId();
  const submittedAt = new Date().toISOString();

  const lines = [
    `Ticket:      ${ticketId}`,
    `Category:    ${category}`,
    `From:        ${name} <${email}>`,
    appVersion ? `App version: ${appVersion}` : null,
    `Submitted:   ${submittedAt}`,
    '',
    `Subject: ${subject}`,
    '',
    message,
  ].filter(Boolean);

  const html = `<h2>${escapeHtml(ticketId)} — ${escapeHtml(subject)}</h2>
<p><strong>Category:</strong> ${escapeHtml(category)}<br>
<strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br>
${appVersion ? `<strong>App version:</strong> ${escapeHtml(appVersion)}<br>` : ''}
<strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
<hr>
<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  let providerResponse;
  try {
    providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[${ticketId}] ${category}: ${subject}`,
        text: lines.join('\n'),
        html,
      }),
    });
  } catch {
    return json(
      { ok: false, error: 'delivery_failed', message: 'We couldn\'t reach our mail service just now.' },
      502,
    );
  }

  if (!providerResponse.ok) {
    return json(
      { ok: false, error: 'delivery_failed', message: 'We couldn\'t reach our mail service just now.' },
      502,
    );
  }

  return json({ ok: true, ticketId, submittedAt }, 200);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }
  return handleSubmission(request, env);
}
