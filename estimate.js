const estimateForm = document.querySelector('#estimate-form');
const estimateSubmit = document.querySelector('.estimate-submit');
const estimateSummary = document.querySelector('#estimate-errors');
const reviewDialog = document.querySelector('#estimate-review');
const reviewData = document.querySelector('#estimate-review-data');
const errorFields = ['clinic-name', 'contact-name', 'contact-phone', 'clinic-address'];
const confirmEstimate = document.querySelector('#estimate-confirm');
const saveStatus = document.querySelector('#estimate-save-status');
const reviewTitle = document.querySelector('#review-title');
const reviewNotice = document.querySelector('.estimate-review-notice');
const editEstimate = document.querySelector('.estimate-edit');
let pendingEstimate;
let pendingRequestId;
let estimateSaving = false;

function clearEstimateErrors() {
  document.querySelectorAll('.estimate-field-error').forEach((field) => { field.textContent = ''; });
  estimateForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  estimateSummary.hidden = true;
  estimateSummary.textContent = '';
}

estimateSubmit.disabled = false;
estimateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (estimateSaving) return;
  clearEstimateErrors();
  const errors = [];
  const markError = (input, message, errorId) => {
    input.setAttribute('aria-invalid', 'true');
    document.querySelector(`#${errorId}`).textContent = message;
    errors.push(input);
  };
  const requiredMessages = ['병원명을 입력해 주세요.', '담당자 성함과 직책을 입력해 주세요.', '연락처를 입력해 주세요.', '병원 소재지를 입력해 주세요.'];
  errorFields.forEach((id, index) => {
    const field = document.getElementById(id);
    if (!field.value.trim()) markError(field, requiredMessages[index], `${id}-error`);
  });
  const phone = document.querySelector('#contact-phone');
  if (phone.value.trim() && !/^0\d{8,10}$/.test(phone.value.replace(/[\s()-]/g, ''))) {
    markError(phone, '전화번호를 확인해 주세요. 예: 010-1234-5678, 02-123-4567', 'contact-phone-error');
  }
  const services = [...estimateForm.querySelectorAll('[name="services"]:checked')].map((field) => field.value);
  const consent = document.querySelector('#estimate-consent');
  if (!consent.checked) markError(consent, '개인정보 안내를 확인해 주세요.', 'consent-error');
  if (errors.length) {
    estimateSummary.textContent = `확인이 필요한 항목이 ${errors.length}개 있습니다. 표시된 내용을 확인해 주세요.`;
    estimateSummary.hidden = false;
    errors[0].focus();
    return;
  }

  const read = (name) => estimateForm.elements.namedItem(name).value.trim();
  pendingRequestId = crypto.randomUUID();
  pendingEstimate = {
    clinicName: read('clinicName'), contactName: read('contactName'),
    phone: read('phone').replace(/[\s()-]/g, ''), address: read('address'),
    clinicType: read('clinicType'), area: read('area'), frequency: read('frequency'),
    changeConsultation: services.length > 0, message: read('message'),
  };
  reviewTitle.textContent = '신청 내용 확인';
  reviewNotice.textContent = '입력 내용을 확인한 뒤 아래 접수 버튼을 눌러 주세요. 접수가 완료되면 접수번호를 안내합니다.';
  saveStatus.textContent = '';
  confirmEstimate.hidden = false;
  confirmEstimate.disabled = false;
  confirmEstimate.textContent = '무료견적 요청 접수하기';
  editEstimate.textContent = '입력 내용 수정';
  const rows = [
    ['병원명', read('clinicName')], ['담당자', read('contactName')], ['연락처', read('phone')], ['병원 소재지', read('address')],
    ['진료 유형', read('clinicType')], ['전용면적', read('area') || '상담 시 확인'], ['관리 주기', read('frequency')],
    ['업체 교체 상담', services.length ? '희망' : '미선택'], ['요청사항', read('message') || '없음'],
  ];
  reviewData.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    return row;
  }));
  reviewDialog.showModal();
});
confirmEstimate.addEventListener('click', async () => {
  if (estimateSaving || !pendingEstimate) return;
  estimateSaving = true;
  confirmEstimate.disabled = true;
  estimateSubmit.disabled = true;
  editEstimate.disabled = true;
  document.querySelector('.estimate-review-close').disabled = true;
  confirmEstimate.textContent = '접수 중…';
  saveStatus.textContent = '견적 요청을 저장하고 있습니다. 잠시 기다려 주세요.';
  try {
    const { saveEstimate } = await import('./firebase-client.js');
    const receipt = await saveEstimate(pendingEstimate, pendingRequestId);
    reviewTitle.textContent = '견적 요청이 접수되었습니다';
    reviewNotice.textContent = `접수번호: ${receipt}`;
    reviewData.replaceChildren();
    saveStatus.textContent = '담당자가 신청 내용을 확인한 후 연락드립니다. 자동 문자 발송은 제공하지 않습니다.';
    confirmEstimate.hidden = true;
    editEstimate.textContent = '닫기';
    pendingEstimate = undefined;
    pendingRequestId = undefined;
    estimateForm.reset();
  } catch (error) {
    const messages = {
      'permission-denied': '접수 권한을 확인할 수 없습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.',
      'unavailable': '현재 서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.',
    };
    saveStatus.textContent = messages[error.code] || '접수 완료를 확인하지 못했습니다. 다시 시도하거나 전화로 문의해 주세요.';
    confirmEstimate.textContent = '접수 다시 시도';
    confirmEstimate.disabled = false;
  } finally {
    estimateSaving = false;
    estimateSubmit.disabled = false;
    editEstimate.disabled = false;
    document.querySelector('.estimate-review-close').disabled = false;
  }
});
document.querySelector('.estimate-review-close').addEventListener('click', () => { if (!estimateSaving) reviewDialog.close(); });
editEstimate.addEventListener('click', () => { if (!estimateSaving) reviewDialog.close(); });
reviewDialog.addEventListener('cancel', (event) => { if (estimateSaving) event.preventDefault(); });
reviewDialog.addEventListener('click', (event) => {
  const bounds = reviewDialog.getBoundingClientRect();
  if (!estimateSaving && event.target === reviewDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) reviewDialog.close();
});
