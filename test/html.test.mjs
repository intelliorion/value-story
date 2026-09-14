import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, page } from '../src/render/html.mjs';
import { TOKENS, tokensToCss } from '../src/render/tokens.mjs';

test('esc neutralises markup and quotes', () => {
  assert.equal(esc('<script>"x"&\'y\'</script>'),
    '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});

test('esc renders nullish as empty string', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('tokens define the dark ground and a single accent', () => {
  assert.ok(TOKENS['--vs-bg']);
  assert.ok(TOKENS['--vs-ink']);
  assert.ok(TOKENS['--vs-accent']);
});

test('tokensToCss emits a root block containing every token', () => {
  const css = tokensToCss();
  assert.ok(css.startsWith(':root{'));
  for (const name of Object.keys(TOKENS)) {
    assert.ok(css.includes(name), `missing ${name}`);
  }
});

test('page emits a self-contained document with no external references', () => {
  const html = page({ title: 'T', styles: 'body{color:red}', body: '<main>x</main>' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>T</title>'));
  assert.ok(html.includes('body{color:red}'));
  assert.ok(html.includes('<main>x</main>'));
  assert.ok(!/<script\s+src=/.test(html), 'must not load external scripts');
  assert.ok(!/<link[^>]+href=/.test(html), 'must not load external stylesheets');
  assert.ok(!/https?:\/\//.test(html), 'must contain no absolute URLs');
});

test('page escapes the title', () => {
  assert.ok(page({ title: '<x>', styles: '', body: '' }).includes('<title>&lt;x&gt;</title>'));
});
