const dialog = document.querySelector('#info-dialog');
const title = document.querySelector('#dialog-title');
const content = document.querySelector('#dialog-content');
const menu = document.querySelector('#mobile-nav');
const menuToggle = document.querySelector('.menu-toggle');
// 기존 HTML이 남아 있어도 완성된 페이지는 실제 주소로 연결합니다.
const pageRoutes = {
  'p1-hospital-regular-cleaning': './p1-hospital-regular-cleaning.html',
  'p2-why-specialist': './p2-why-specialist.html',
  'p3-our-work': './p3-our-work.html',
  'p4-change-guide': './p4-change-guide.html',
  'p5-estimate': './p5-estimate.html',
  'p6-admin': './p6-admin.html',
};
document.querySelectorAll('a[data-path]').forEach((link) => {
  const route = pageRoutes[link.dataset.path];
  if (route) link.setAttribute('href', route);
});
const pages = {
  'privacy-policy': ['개인정보 처리방침', '무료견적 신청 시 병원명, 담당자, 연락처, 소재지와 상담 정보를 수집합니다. 견적 상담과 방문 일정 조율을 위해 접수 후 90일간 보관하며, 기간이 지나면 관리자가 확인하여 삭제합니다. 신청 화면에서 수집·이용 안내와 동의 내용을 확인해 주세요.'],
  'terms-of-service': ['이용약관', '이용약관을 준비 중입니다. 서비스 계약과 이용 조건은 전화 상담 시 확인해 주세요.'],
  'medical-guidelines': ['의료기관 위생 규정집', '규정집 자료를 준비 중입니다. 적용 가능한 관리 범위와 절차는 상담 시 확인해 주세요.'],
  'p6-admin': ['관리자 접속', '관리자 기능은 아직 연결되지 않았습니다.'],
};
function closeMenu() {
  menu.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', '메뉴 열기');
}
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
});
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-path]');
  if (!link || link.classList.contains('group') && link.querySelector('.brand')) return;
  if (link.getAttribute('href') !== '#') return;
  const page = pages[link.dataset.path];
  if (!page) return;
  event.preventDefault();
  closeMenu();
  title.textContent = page[0];
  content.replaceChildren(...page.slice(1).map((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  dialog.showModal();
});
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
matchMedia('(min-width:1200px)').addEventListener('change', closeMenu);
