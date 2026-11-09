import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
async function actionHarness(query, invalid = false) {
  const dom = new JSDOM(await readFile(new URL('../auth-hosting/auth-action.html', import.meta.url), 'utf8'), { url: 'https://trading-dashboard-480711.firebaseapp.com/auth-action.html' + query });
  const calls = []; let appConfig;
  const sdk = {
    getAuth: () => ({}),
    verifyPasswordResetCode: async (_, code) => { calls.push(['check', code]); if (invalid) throw { code: 'auth/expired-action-code' }; return 'kingdom2765@naver.com'; },
    confirmPasswordReset: async (_, code, password) => { calls.push(['reset', code, password]); },
    checkActionCode: async () => ({ operation: 'VERIFY_EMAIL', data: { email: 'kingdom2765@naver.com' } }),
    applyActionCode: async () => calls.push(['verify']),
  };
  const context = vm.createContext({ document: dom.window.document, location: dom.window.location, history: dom.window.history, URLSearchParams });
  async function mock(exports) {
    const result = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    await result.link(() => {}); await result.evaluate(); return result;
  }
  const app = await mock({ initializeApp: config => { appConfig = config; return {}; } }); const auth = await mock(sdk);
  const page = new vm.SourceTextModule(await readFile(new URL('../auth-hosting/auth-action.js', import.meta.url), 'utf8'), { context, importModuleDynamically: specifier => specifier.includes('firebase-app.js') ? app : auth });
  await page.link(() => {}); await page.evaluate();
  return { dom, calls, appConfig, $: selector => dom.window.document.querySelector(selector) };
}
test('reset link without API key uses configured project and requires matching passwords', async () => {
  const app = await actionHarness('?mode=resetPassword&oobCode=fake-test-code&apiKey=');
  assert.equal(app.$('#password-form').hidden, false); assert.ok(app.appConfig.apiKey);
  assert.equal(app.dom.window.location.search, '', 'one-time code is removed from visible history');
  app.$('#new-password').value = 'example-only-password'; app.$('#confirm-password').value = 'different';
  const submit = () => app.$('#password-form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  submit(); assert.equal(app.calls.filter(item => item[0] === 'reset').length, 0);
  app.$('#confirm-password').value = 'example-only-password'; submit();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.filter(item => item[0] === 'reset').length, 1);
  assert.equal(app.$('#password-form').hidden, true); assert.equal(app.$('#new-password').value, '');
  assert.match(app.$('#action-title').textContent, /완료/); app.dom.window.close();
});
test('expired and incomplete links cannot submit passwords', async () => {
  const expired = await actionHarness('?mode=resetPassword&oobCode=expired', true);
  assert.equal(expired.$('#password-form').hidden, true); assert.match(expired.$('#action-message').textContent, /유효기간/);
  const incomplete = await actionHarness('?mode=resetPassword');
  assert.equal(incomplete.$('#password-form').hidden, true); assert.equal(incomplete.calls.length, 0);
  expired.dom.window.close(); incomplete.dom.window.close();
});
test('email verification checks token before requiring a user confirmation', async () => {
  const app = await actionHarness('?mode=verifyEmail&oobCode=test-verification&apiKey=');
  assert.equal(app.$('#verify-submit').hidden, false); assert.equal(app.calls.length, 0);
  app.$('#verify-submit').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls[0][0], 'verify'); assert.match(app.$('#action-title').textContent, /완료/); app.dom.window.close();
});
