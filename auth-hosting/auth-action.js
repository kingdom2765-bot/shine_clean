// Use this project's known public key; email links may arrive without apiKey.
// Never log or persist one-time codes or passwords.
const config = { apiKey: 'AIzaSyBpsEsjN2pYRO8B2XedS4bzvmJZKXyLZY4', authDomain: 'trading-dashboard-480711.firebaseapp.com', projectId: 'trading-dashboard-480711' };
const $ = selector => document.querySelector(selector);
const message = text => { $('#action-message').textContent = text; };
let sdk, auth, code;
const failure = error => ({
  'auth/expired-action-code': '링크의 유효기간이 지났습니다. 관리자 화면에서 새 메일을 요청해 주세요.',
  'auth/invalid-action-code': '이미 사용했거나 유효하지 않은 링크입니다. 가장 최근에 받은 메일을 사용하거나 새 메일을 요청해 주세요.',
  'auth/weak-password': '비밀번호가 너무 단순합니다. 더 긴 비밀번호로 다시 입력해 주세요.',
  'auth/password-does-not-meet-requirements': '비밀번호 보안 기준에 맞지 않습니다. 더 긴 비밀번호로 다시 입력해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인하고 다시 시도해 주세요.',
  'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
}[error.code] || '링크를 처리하지 못했습니다. 인터넷 연결을 확인하고 관리자 화면에서 새 메일을 요청해 주세요.');
function success(title, text) {
  code = undefined; $('#action-title').textContent = title; message(text);
  $('#password-form').hidden = true; $('#verify-submit').hidden = true; $('#action-next').hidden = false;
  $('#password-form').reset();
}
$('#password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('#new-password').value;
  if (password.length < 8) { message('비밀번호를 8자 이상 입력해 주세요.'); return; }
  if (password !== $('#confirm-password').value) { message('두 비밀번호가 일치하지 않습니다.'); return; }
  if (!auth || !code) return;
  $('#password-submit').disabled = true; message('비밀번호를 설정하고 있습니다.');
  try { await sdk.confirmPasswordReset(auth, code, password); success('비밀번호 설정 완료', '새 관리자 비밀번호를 설정했습니다.'); }
  catch (error) { message(failure(error)); }
  finally { $('#password-submit').disabled = false; }
});
$('#verify-submit').addEventListener('click', async () => {
  if (!auth || !code) return;
  $('#verify-submit').disabled = true;
  try { await sdk.applyActionCode(auth, code); success('이메일 인증 완료', '관리자 이메일 인증을 완료했습니다. 관리자 화면에서 인증 완료 후 다시 확인을 눌러 주세요.'); }
  catch (error) { message(failure(error)); }
  finally { $('#verify-submit').disabled = false; }
});
try {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode'); code = params.get('oobCode');
  if (!code || !['resetPassword', 'verifyEmail'].includes(mode)) {
    $('#action-title').textContent = '메일에서 링크를 열어 주세요';
    message('이 페이지는 이메일에 포함된 전용 링크로 이용할 수 있습니다. 관리자 화면에서 새 메일을 요청한 뒤 링크를 눌러 주세요.');
  } else {
    // Remove credential-bearing query parameters from browser history after reading.
    history.replaceState(null, '', location.pathname);
    const [appSdk, authSdk] = await Promise.all([import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js')]);
    sdk = authSdk; auth = sdk.getAuth(appSdk.initializeApp(config, 'shine-clean-email-action')); auth.languageCode = 'ko';
    if (mode === 'resetPassword') {
      const email = await sdk.verifyPasswordResetCode(auth, code);
      if (email.toLowerCase() !== 'kingdom2765@naver.com') throw new Error('unsupported-account');
      $('#action-title').textContent = '관리자 비밀번호 설정'; message('새 비밀번호를 입력해 주세요.'); $('#password-form').hidden = false;
    } else {
      const info = await sdk.checkActionCode(auth, code);
      if (info.operation !== 'VERIFY_EMAIL' || info.data.email?.toLowerCase() !== 'kingdom2765@naver.com') throw new Error('unsupported-account');
      $('#action-title').textContent = '관리자 이메일 인증'; message('아래 버튼을 눌러 이메일 인증을 완료해 주세요.'); $('#verify-submit').hidden = false;
    }
  }
} catch (error) { code = undefined; message(failure(error)); }
