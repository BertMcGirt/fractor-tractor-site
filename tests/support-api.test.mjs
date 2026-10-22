import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../functions/api/support.js', import.meta.url), 'utf8');
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const validData = {
  name: 'Test Visitor', email: 'visitor@example.com', category: 'Bug Report',
  subject: 'Test ticket', message: 'Test description', appVersion: '1.0', company: '',
};
// Fake configuration only. Provider requests are mocked; no mail is sent.
const testEnv = { RESEND_API_KEY: 'test-placeholder', SUPPORT_FROM: 'support@example.com' };

function submit(body, env = testEnv) {
  return onRequest({
    request: new Request('https://example.com/api/support', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    }),
    env,
  });
}

test('invalid JSON and non-object payloads return controlled 400 errors without reaching the provider', async t => {
  let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { providerCalls += 1; throw new Error('must not call provider'); });
  for (const body of ['{', 'null', '[]', '"text"', '42', 'true']) {
    const result = await submit(body);
    assert.equal(result.status, 400, body);
    assert.equal(result.headers.get('Content-Type'), 'application/json');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), {
      ok: false, error: 'invalid_request', message: 'Could not read the submitted form.',
    });
  }
  assert.equal(providerCalls, 0);
});

test('existing honeypot, required-field and email validation reject before provider requests', async t => {
  let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { providerCalls += 1; throw new Error('must not call provider'); });
  for (const [data, error] of [
    [{ ...validData, company: 'bot' }, 'rejected'],
    [{}, 'missing_fields'],
    [{ ...validData, name: null }, 'missing_fields'],
    [{ ...validData, message: ['invalid'] }, 'missing_fields'],
    [{ ...validData, email: 'not-an-email' }, 'invalid_email'],
  ]) {
    const result = await submit(JSON.stringify(data));
    assert.equal(result.status, 400);
    assert.equal((await result.json()).error, error);
  }
  assert.equal(providerCalls, 0);
});

test('unconfigured delivery never claims success', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call provider'); });
  const result = await submit(JSON.stringify(validData), {});
  assert.equal(result.status, 503);
  const body = await result.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'not_configured');
  assert.equal(body.ticketId, undefined);
});

test('provider rejection and network exceptions return fixed errors, not provider content', async t => {
  for (const provider of [
    async () => new Response('<img src=x onerror=alert(1)>', { status: 500 }),
    async () => { throw new Error('private provider diagnostic'); },
  ]) {
    const mocked = t.mock.method(globalThis, 'fetch', provider);
    const result = await submit(JSON.stringify(validData));
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), {
      ok: false, error: 'delivery_failed', message: 'We couldn\'t reach our mail service just now.',
    });
    mocked.mock.restore();
  }
});

test('accepted provider response returns a reference and escapes all ticket HTML', async t => {
  const data = {
    ...validData,
    name: '<b>Test & Visitor</b>',
    subject: '\"subject\" <script>alert(1)</script>',
    message: '<img src=x onerror=alert(1)> & \'quoted\'',
    appVersion: '<test>',
    category: '<invalid category>',
  };
  let providerRequest;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    providerRequest = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'mock-provider-id' }), { status: 200 });
  });
  const result = await submit(JSON.stringify(data));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.ok, true);
  assert.match(body.ticketId, /^FT-[23456789BCDFGHJKLMNPQRSTVWXYZ]{6}$/);
  assert.equal(Number.isNaN(Date.parse(body.submittedAt)), false);
  assert.equal(providerRequest.reply_to, validData.email);
  assert.deepEqual(providerRequest.to, ['albert@trimultaneously.com']);
  assert.equal(providerRequest.from, testEnv.SUPPORT_FROM);
  assert.equal(providerRequest.html.includes('<script>'), false);
  assert.equal(providerRequest.html.includes('<img'), false);
  assert.equal(providerRequest.html.includes('<b>Test'), false);
  assert.ok(providerRequest.html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &#39;quoted&#39;'));
  assert.ok(providerRequest.html.includes('&lt;b&gt;Test &amp; Visitor&lt;/b&gt;'));
  assert.ok(providerRequest.html.includes('&quot;subject&quot; &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(providerRequest.html.includes('&lt;test&gt;'));
  assert.ok(providerRequest.html.includes('<strong>Category:</strong> Other'));
  assert.ok(providerRequest.text.includes(data.message));
});

test('unsupported methods remain rejected', async () => {
  const result = await onRequest({ request: new Request('https://example.com/api/support'), env: {} });
  assert.equal(result.status, 405);
  assert.deepEqual(await result.json(), { ok: false, error: 'method_not_allowed' });
});
