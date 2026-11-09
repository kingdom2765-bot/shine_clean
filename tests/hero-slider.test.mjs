import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../pages/index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../motion.js', import.meta.url), 'utf8');
function harness(reduced = false) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window, listeners = [], timers = new Map(); let sequence = 0;
  const preference = { matches: reduced, addEventListener: (_, fn) => listeners.push(fn) };
  win.matchMedia = () => preference;
  win.setTimeout = (fn, delay) => { assert.equal(delay, 6000); timers.set(++sequence, fn); return sequence; };
  win.clearTimeout = id => timers.delete(id);
  win.document.querySelectorAll('.hero-slide').forEach(img => Object.defineProperty(img, 'naturalWidth', { value: 1200 }));
  win.eval(source);
  const doc = win.document;
  return { dom, timers, doc, dots: [...doc.querySelectorAll('[data-slide]')], toggle: doc.querySelector('[data-slide-toggle]'),
    active: () => [...doc.querySelectorAll('.hero-slide')].findIndex(img => img.classList.contains('is-active')),
    next: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    reduce: () => { preference.matches = true; listeners.forEach(fn => fn()); },
  };
}

test('hero cycles three photos, supports manual choice and pause/resume without changing the headline', () => {
  const app = harness(); const heading = app.doc.querySelector('h1').textContent;
  assert.equal(app.doc.querySelector('.hero-slider-controls').hidden, false);
  assert.equal(app.active(), 0); app.next(); assert.equal(app.active(), 1);
  app.toggle.click(); assert.equal(app.timers.size, 0);
  app.dots[2].click(); assert.equal(app.active(), 2); assert.equal(app.timers.size, 0);
  assert.equal(app.dots[2].getAttribute('aria-pressed'), 'true');
  assert.match(app.doc.querySelector('[data-slide-status]').textContent, /3 \/ 3/);
  app.toggle.click(); app.next(); assert.equal(app.active(), 0);
  assert.equal(app.doc.querySelector('h1').textContent, heading);
  app.dom.window.close();
});

test('reduced motion disables autoplay while keeping manual photo selection available', () => {
  const app = harness(true);
  assert.equal(app.timers.size, 0);
  app.dots[1].click(); assert.equal(app.active(), 1); assert.equal(app.timers.size, 0);
  app.dom.window.close();
  const running = harness(); assert.equal(running.timers.size, 1);
  running.reduce(); assert.equal(running.timers.size, 0);
  assert.match(running.toggle.textContent, /재생/);
  running.dom.window.close();
});

test('failed photos are skipped and controls or keyboard focus temporarily suspend autoplay', () => {
  const app = harness();
  app.doc.querySelector('.hero-slide').dispatchEvent(new app.dom.window.Event('error'));
  assert.equal(app.active(), 1); assert.ok(app.dots[0].disabled);
  const controls = app.doc.querySelector('.hero-slider-controls');
  controls.dispatchEvent(new app.dom.window.Event('mouseenter')); assert.equal(app.timers.size, 0);
  controls.dispatchEvent(new app.dom.window.Event('mouseleave')); assert.equal(app.timers.size, 1);
  app.toggle.focus(); assert.equal(app.timers.size, 0);
  app.toggle.blur(); assert.equal(app.timers.size, 1);
  app.dom.window.close();
});
