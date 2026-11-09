import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../motion.js', import.meta.url), 'utf8');
function harness({ reduced = false, observe = true } = {}) {
  const dom = new JSDOM('<main><section class="motion-hero"><h1 data-hero-part>청소 안내</h1></section><span data-count>98.4% 갱신율</span><ol class="process-steps"><li>상담</li></ol><h2>거래처 안내</h2><div class="work-client-grid"><article>거래처</article></div></main>', { runScripts: 'outside-only' });
  const win = dom.window;
  const listeners = [];
  const preference = { matches: reduced, addEventListener: (_, fn) => listeners.push(fn) };
  win.matchMedia = () => preference;
  const pending = new Map(); let sequence = 0;
  win.requestAnimationFrame = fn => { pending.set(++sequence, fn); return sequence; };
  win.cancelAnimationFrame = id => pending.delete(id);
  let entries, observed = [], disconnected = false;
  if (observe) win.IntersectionObserver = class {
    constructor(callback) { entries = callback; }
    observe(element) { observed.push(element); }
    unobserve(element) { observed = observed.filter(item => item !== element); }
    disconnect() { disconnected = true; }
  };
  win.eval(source);
  return { dom, doc: win.document, pending, observed: () => observed,
    enter: () => entries?.(observed.map(target => ({ target, isIntersecting: true }))),
    reduce: () => { preference.matches = true; listeners.forEach(fn => fn()); },
    disconnected: () => disconnected,
    frame: time => { const current = [...pending.values()]; pending.clear(); current.forEach(fn => fn(time)); }
  };
}

test('reduced motion keeps final figures and mobile-friendly original content immediately available', () => {
  const app = harness({ reduced: true });
  assert.equal(app.doc.querySelector('[data-count]').textContent, '98.4% 갱신율');
  assert.equal(app.doc.querySelector('.motion-enabled'), null);
  assert.ok(app.doc.querySelector('.process-complete'));
  assert.equal(app.pending.size, 0);
  app.dom.window.close();
});

test('changing motion preference during counting restores final values and cancels observers and frames', () => {
  const app = harness();
  app.enter(); app.frame(0); app.frame(300);
  assert.equal(app.doc.querySelector('.motion-sr-only').textContent, '98.4% 갱신율');
  const visual = app.doc.querySelector('[data-count] [aria-hidden]');
  assert.notEqual(visual.textContent, '98.4% 갱신율');
  app.reduce(); app.frame(400);
  assert.equal(visual.textContent, '98.4% 갱신율');
  assert.equal(app.pending.size, 0);
  assert.ok(app.disconnected());
  app.dom.window.close();
});

test('without observer support final text remains readable', () => {
  const app = harness({ observe: false });
  assert.equal(app.doc.querySelector('[data-count]').textContent, '98.4% 갱신율');
  assert.ok(app.doc.querySelector('.process-complete'));
  app.dom.window.close();
});

test('scroll observes only counters and process lines, excluding headings and client cards', () => {
  const app = harness();
  assert.equal(app.observed().length, 2);
  assert.ok(app.observed().every(element => element.matches('[data-count], .process-steps > li')));
  app.dom.window.close();
});
