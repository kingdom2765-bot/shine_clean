// Firebase Web configuration is public. Never place service-account keys here.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyBpsEsjN2pYRO8B2XedS4bzvmJZKXyLZY4',
  authDomain: 'trading-dashboard-480711.firebaseapp.com',
  projectId: 'trading-dashboard-480711',
  storageBucket: 'trading-dashboard-480711.firebasestorage.app',
  messagingSenderId: '798920529592',
  appId: '1:798920529592:web:ee9897d6aba01beaf1064d',
});

export const estimatePrivacyVersion = '2026-11-09';
let firebasePromise;
export function loadFirestore() {
  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js'),
    ]).then(([appSdk, firestoreSdk]) => {
      const app = appSdk.getApps().find((item) => item.name === 'shine-clean') || appSdk.initializeApp(firebaseConfig, 'shine-clean');
      return { sdk: firestoreSdk, db: firestoreSdk.getFirestore(app), app };
    }).catch((error) => { firebasePromise = undefined; throw error; });
  }
  return firebasePromise;
}

export async function saveEstimate(estimate, requestId) {
  if (!navigator.onLine) throw new Error('인터넷 연결을 확인한 후 다시 신청해 주세요.');
  const { sdk, db } = await loadFirestore();
  // Analytics must never prevent a consultation request from being saved.
  let analyticsContext;
  try { analyticsContext = (await import('./analytics.js')).estimateContext(); } catch { /* no tracking context */ }
  const record = {
    ...estimate,
    requestId,
    privacyConsent: true,
    privacyVersion: estimatePrivacyVersion,
    status: 'new',
    createdAt: sdk.serverTimestamp(),
    expiresAt: sdk.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
    ...(analyticsContext ? { analyticsContext } : {}),
  };
  await sdk.setDoc(sdk.doc(db, 'estimate_requests', requestId), record);
  return requestId;
}
