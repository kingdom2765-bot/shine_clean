const clientItems = [...document.querySelectorAll('.work-client')];
const pagination = document.querySelector('#client-pagination');
const resultCount = document.querySelector('#client-result-count');
const pageSize = 12;
let currentPage = 1;

function renderClients() {
  const pageCount = Math.ceil(clientItems.length / pageSize);
  currentPage = Math.min(currentPage, Math.max(pageCount, 1));
  clientItems.forEach((item) => { item.hidden = true; });
  clientItems.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach((item) => { item.hidden = false; });
  resultCount.textContent = `총 ${clientItems.length}개 가상 의료현장${clientItems.length ? ` · ${currentPage} / ${pageCount} 페이지` : ''}`;
  pagination.replaceChildren();
  for (let page = 1; page <= pageCount; page++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(page);
    button.setAttribute('aria-label', `${page}페이지`);
    if (page === currentPage) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      currentPage = page;
      renderClients();
      pagination.querySelector('[aria-current="page"]').focus();
    });
    pagination.append(button);
  }
}
renderClients();

const caseDialog = document.querySelector('#case-dialog');
const caseBody = document.querySelector('#case-body');
document.querySelectorAll('[data-case]').forEach((button) => button.addEventListener('click', () => {
  const template = document.querySelector(`#case-template-${button.dataset.case}`);
  caseBody.replaceChildren(template.content.cloneNode(true));
  caseDialog.showModal();
}));
document.querySelector('.case-close').addEventListener('click', () => caseDialog.close());
caseDialog.addEventListener('click', (event) => {
  const bounds = caseDialog.getBoundingClientRect();
  if (event.target === caseDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) caseDialog.close();
});
