import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

const uid = 'cOLPnjEzpgXYKdowCJcsKIf4xP73';
const stamp = value => ({ toDate: () => new Date(value), toMillis: () => value });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 50; i++) { if (predicate()) return; await tick(); } throw new Error('Expected UI state was not reached'); }
async function harness(clients = false) {
  const html = await readFile(new URL(clients ? '../pages/p7-clients.html' : '../pages/p6-admin.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/p6-admin.html' });
  const document = dom.window.document;
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
  }
  const store = new Map([['sample-1', {
    clinicName: '<img src=x onerror=alert(1)> 테스트의원', contactName: '가상 담당자', phone: '01012345678',
    address: '서울 강남구', clinicType: '피부과 / 성형외과', frequency: '주 5회 (월~금)',
    toiletIncluded: true, newOpeningConsultation: true, status: 'new', message: '<script>실행되면 안 됨</script>', privacyConsent: true, createdAt: stamp(1000),
  }]]);
  let authListener;
  const auth = { currentUser: null };
  const verifiedUser = { uid, email: 'kingdom2765@naver.com', emailVerified: true, getIdTokenResult: async () => ({ claims: { admin: true } }) };
  const sdk = {
    collection: () => null, doc: (_, __, id) => id, orderBy: () => null, startAfter: () => null, limit: () => null, query: () => null,
    getDocs: async () => ({ docs: [...store].map(([id, value]) => ({ id, data: () => value })), size: store.size }),
    serverTimestamp: () => stamp(2000),
    runTransaction: async (_, callback) => {
      const writes = [];
      await callback({ get: async id => ({ exists: () => store.has(id), data: () => store.get(id) }),
        update: (id, changes) => writes.push(() => store.set(id, { ...store.get(id), ...changes })),
        delete: id => writes.push(() => store.delete(id)) });
      writes.forEach(write => write());
    },
  };
  const authSdk = {
    getAuth: () => auth, browserSessionPersistence: {}, setPersistence: async () => {},
    onAuthStateChanged: (_, listener) => { authListener = listener; listener(null); },
    signOut: async () => { auth.currentUser = null; await authListener(null); },
    signInWithEmailAndPassword: async () => {}, sendPasswordResetEmail: async () => {}, sendEmailVerification: async () => {}, reload: async () => {},
  };
  const context = vm.createContext({ document, window: dom.window, console, Intl, crypto: webcrypto });
  async function mockModule(exports) {
    const module = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    await module.link(() => {}); await module.evaluate(); return module;
  }
  const connection = await mockModule({ loadFirestore: async () => ({ sdk, db: {}, app: {} }) });
  const authentication = await mockModule(authSdk);
  const model = new vm.SourceTextModule(await readFile(new URL('../admin-model.js', import.meta.url), 'utf8'), { context });
  const clientModel = new vm.SourceTextModule(await readFile(new URL('../client-model.js', import.meta.url), 'utf8'), { context });
  const clientModule = new vm.SourceTextModule(await readFile(new URL('../client-records.js', import.meta.url), 'utf8'), { context });
  const publicModel = new vm.SourceTextModule(await readFile(new URL('../public-client-model.js', import.meta.url), 'utf8'), { context });
  await clientModule.link(specifier => specifier === './public-client-model.js' ? publicModel : clientModel); await clientModule.evaluate();
  sdk.documentId = () => '__name__';
  const application = new vm.SourceTextModule(await readFile(new URL('../admin.js', import.meta.url), 'utf8'), {
    context, importModuleDynamically: async specifier => specifier === './client-records.js' ? clientModule : authentication,
  });
  await application.link(specifier => specifier === './firebase-client.js' ? connection : model);
  await application.evaluate();
  return { dom, document, store, verifiedUser, login: async user => { auth.currentUser = user; await authListener(user); },
    click: id => document.querySelector(id).click(),
    submit: id => document.querySelector(id).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) };
}

test('verified administrator can view, save, detect conflicts and confirm deletion', async () => {
  const app = await harness(); const $ = selector => app.document.querySelector(selector);
  await app.login(app.verifiedUser);
  assert.equal($('#admin-dashboard').hidden, false);
  assert.equal($('#admin-list').children.length, 1);
  assert.equal($('#admin-list').querySelectorAll('img,script').length, 0, 'untrusted application text is not interpreted as HTML');
  app.click('.admin-row'); assert.equal($('#admin-detail').open, true);
  assert.equal($('#admin-detail-fields').querySelectorAll('script').length, 0);
  assert.match($('#admin-detail-fields').textContent, /화장실 청소포함/);
  assert.match($('#admin-detail-fields').textContent, /신규 OPEN 병원 상담희망/);
  $('#admin-status').value = 'quoted'; $('#admin-notes').value = '가상 상담 기록'; app.submit('#admin-edit-form');
  await until(() => !$('#admin-save').disabled);
  assert.equal(app.store.get('sample-1').status, 'quoted');
  assert.equal(app.store.get('sample-1').adminNotes, '가상 상담 기록');
  assert.equal(app.store.get('sample-1').updatedBy, uid);
  assert.equal(app.store.get('sample-1').phone, '01012345678', 'submission details are preserved');
  app.click('.admin-row');
  app.store.set('sample-1', { ...app.store.get('sample-1'), updatedAt: stamp(3000), adminNotes: '다른 창에서 기록' });
  $('#admin-notes').value = '오래된 창의 기록'; app.submit('#admin-edit-form'); await until(() => !$('#admin-save').disabled);
  assert.match($('#admin-detail-feedback').textContent, /다른 창에서 변경/);
  assert.equal(app.store.get('sample-1').adminNotes, '다른 창에서 기록');
  app.click('#admin-detail-close'); app.click('#admin-refresh'); await until(() => !$('#admin-refresh').disabled);
  app.click('.admin-row'); app.click('#admin-delete'); assert.equal(app.store.size, 1, 'opening confirmation never deletes data');
  app.click('#admin-delete-cancel'); assert.equal(app.store.size, 1);
  app.click('#admin-delete'); app.click('#admin-delete-confirm'); await until(() => !$('#admin-delete-confirm').disabled);
  assert.equal(app.store.size, 0); assert.equal($('#admin-empty').hidden, false);
  app.dom.window.close();
});

test('unverified and other accounts never receive dashboard data', async () => {
  const app = await harness(); const $ = selector => app.document.querySelector(selector);
  await app.login({ ...app.verifiedUser, emailVerified: false });
  assert.equal($('#admin-verification').hidden, false); assert.equal($('#admin-dashboard').hidden, true);
  assert.equal($('#admin-list').children.length, 0);
  await app.login({ ...app.verifiedUser, uid: 'another-user' });
  assert.equal($('#admin-dashboard').hidden, true); assert.equal($('#admin-list').children.length, 0);
  assert.match($('#admin-notice').textContent, /권한이 없는/);
  app.dom.window.close();
});


test('client page shares administrator authentication and blocks unauthorized access', async () => {
  const app = await harness(true); const $ = selector => app.document.querySelector(selector);
  await app.login({ ...app.verifiedUser, emailVerified: false });
  assert.equal($('#admin-dashboard').hidden, true); assert.equal($('#client-list').children.length, 0);
  await app.login(app.verifiedUser);
  assert.equal($('#admin-dashboard').hidden, false); assert.equal($('#client-list').children.length, 1);
  await app.login({ ...app.verifiedUser, uid: 'another-user' });
  assert.equal($('#admin-dashboard').hidden, true); assert.equal($('#client-list').children.length, 0);
  app.dom.window.close();
});
