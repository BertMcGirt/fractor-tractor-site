import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const validData = {
  name: 'Test Visitor', email: 'visitor@example.com', category: 'Bug Report',
  subject: 'Test ticket', message: 'Test description', appVersion: '1.0', company: '',
};

// A deliberately small DOM double: any HTML-parsing sink fails the test.
// These are unit tests, not a substitute for browser/visual QA.
class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.nodes = [];
    this.style = {};
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    };
    this.disabled = false;
    this.resetCount = 0;
    this.scrollCount = 0;
  }
  set innerHTML(value) { throw new Error('HTML parsing is forbidden in support status rendering'); }
  set textContent(value) { this.nodes = value === '' ? [] : [String(value)]; }
  get textContent() { return this.nodes.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  get children() { return this.nodes.filter(node => typeof node !== 'string'); }
  append(...nodes) { this.nodes.push(...nodes); }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  scrollIntoView() { this.scrollCount += 1; }
  reset() { this.resetCount += 1; }
}

function setup(fetchImpl, data = validData) {
  const ids = ['supportForm', 'ticketFormWrap', 'ticketConfirmation', 'ticketReference', 'ticketError', 'supportSubmit', 'ticketReset'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements.supportSubmit.textContent = 'Submit Ticket';
  elements.supportForm.data = { ...data };
  const requests = [];
  let initialize;
  const document = {
    addEventListener: (type, callback) => { if (type === 'DOMContentLoaded') initialize = callback; },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: id => elements[id] || null,
    createElement: tag => new Element(tag),
  };
  runInNewContext(source, {
    document,
    window: { location: { pathname: '/support.html' } },
    FormData: class { constructor(form) { return new Map(Object.entries(form.data)); } },
    fetch: async (...args) => { requests.push(args); return fetchImpl(...args); },
  });
  initialize();
  return {
    ...elements, requests,
    submit: () => elements.supportForm.listeners.submit({ preventDefault() {} }),
    reset: () => elements.ticketReset.listeners.click(),
  };
}

const response = (body, ok = false) => ({ ok, json: async () => body });

function assertFallback(ui, data = validData) {
  assert.equal(ui.ticketError.children.length, 1);
  const link = ui.ticketError.children[0];
  assert.equal(link.tagName, 'A');
  assert.equal(link.textContent, 'email it to us directly');
  const url = new URL(link.href);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'albert@trimultaneously.com');
  assert.equal(url.searchParams.get('subject'), '[Fractor Tractor Support] ' + data.category + ': ' + data.subject);
  assert.equal(url.searchParams.get('body'), 'Name: ' + data.name + '\nEmail: ' + data.email +
    (data.appVersion ? '\nApp version: ' + data.appVersion : '') + '\n\n' + data.message);
  assert.equal(ui.ticketError.classList.contains('ticket-status--error'), true);
  assert.equal(ui.ticketConfirmation.classList.contains('ticket-confirmation--visible'), false);
  assert.equal(ui.supportForm.resetCount, 0);
  assert.equal(ui.supportSubmit.disabled, false);
  assert.equal(ui.supportSubmit.textContent, 'Submit Ticket');
}

test('untrusted response markup stays literal text and fallback content stays in its fixed mailto URL', async () => {
  const message = '<img src=x onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a>&quot;';
  const data = { ...validData, name: 'Test <b>Visitor</b>', subject: '\" onclick=\"alert(1) & extra=yes', message: '</a><script>alert(1)</script>\n?body=override#fragment' };
  const ui = setup(() => response({ ok: false, message }), data);
  await ui.submit();
  assert.equal(ui.ticketError.nodes[0], message);
  assertFallback(ui, data);
  assert.equal(ui.requests[0][0], '/api/support');
  assert.equal(ui.requests[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(ui.requests[0][1].body), data);
});

test('client validation uses plain text, keeps the form and does not submit', async t => {
  for (const data of [{ ...validData, name: ' ' }, { ...validData, email: 'not-an-email' }]) {
    await t.test(data.email, async () => {
      const ui = setup(() => { throw new Error('must not fetch'); }, data);
      await ui.submit();
      assert.equal(ui.requests.length, 0);
      assert.equal(ui.ticketError.children.length, 0);
      assert.equal(ui.ticketError.classList.contains('ticket-status--error'), true);
      assert.equal(ui.supportForm.resetCount, 0);
    });
  }
});

test('malformed response shapes and non-string messages use the normal fallback', async t => {
  for (const body of [null, [], 'unexpected', {}, { message: 42 }, { message: {} }, { message: '' }, { message: '  ' }]) {
    await t.test(JSON.stringify(body), async () => {
      const ui = setup(() => response(body));
      await ui.submit();
      assert.equal(ui.ticketError.nodes[0], 'We couldn’t submit your ticket just now.');
      assertFallback(ui);
    });
  }
});

test('invalid JSON and network failures preserve the ticket and email fallback', async t => {
  await t.test('invalid JSON', async () => {
    const ui = setup(() => ({ ok: false, json: async () => { throw new SyntaxError('bad JSON'); } }));
    await ui.submit();
    assert.equal(ui.ticketError.nodes[0], 'We couldn’t submit your ticket just now.');
    assertFallback(ui);
  });
  await t.test('network failure', async () => {
    const ui = setup(() => { throw new Error('offline'); });
    await ui.submit();
    assert.equal(ui.ticketError.nodes[0], 'We couldn’t reach our servers — check your connection.');
    assertFallback(ui);
  });
});

test('only an HTTP success with explicit ok and a nonempty string reference confirms delivery', async t => {
  for (const [body, ok] of [
    [{ ok: true, ticketId: 'FT-234BCD' }, false],
    [{ ok: 'yes', ticketId: 'FT-234BCD' }, true],
    [{ ok: true, ticketId: {} }, true],
    [{ ok: true, ticketId: 123 }, true],
    [{ ok: true, ticketId: ' ' }, true],
    [{ ok: true }, true],
  ]) {
    await t.test(JSON.stringify([body, ok]), async () => {
      const ui = setup(() => response(body, ok));
      await ui.submit();
      assertFallback(ui);
    });
  }
});

test('sending state, retry, success, and submit-another reset preserve the form UX', async () => {
  let resolveResponse;
  const ui = setup(() => new Promise(resolve => { resolveResponse = resolve; }));
  const pending = ui.submit();
  assert.equal(ui.supportSubmit.disabled, true);
  assert.equal(ui.supportSubmit.textContent, 'Sending…');
  resolveResponse(response({ message: 'Try again' }));
  await pending;
  assertFallback(ui);

  const retry = ui.submit();
  assert.equal(ui.ticketError.textContent, '');
  assert.equal(ui.ticketError.children.length, 0);
  assert.equal(ui.ticketError.classList.contains('ticket-status--error'), false);
  resolveResponse(response({ ok: true, ticketId: 'FT-234BCD' }, true));
  await retry;
  assert.equal(ui.ticketReference.textContent, 'FT-234BCD');
  assert.equal(ui.ticketFormWrap.style.display, 'none');
  assert.equal(ui.ticketConfirmation.classList.contains('ticket-confirmation--visible'), true);
  assert.equal(ui.supportForm.resetCount, 1);
  assert.equal(ui.supportSubmit.disabled, false);
  assert.equal(ui.supportSubmit.textContent, 'Submit Ticket');

  ui.reset();
  assert.equal(ui.ticketConfirmation.classList.contains('ticket-confirmation--visible'), false);
  assert.equal(ui.ticketFormWrap.style.display, '');
  assert.equal(ui.ticketError.textContent, '');
});
