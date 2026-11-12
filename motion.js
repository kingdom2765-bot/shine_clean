// Progressive enhancement: content stays visible when JavaScript or motion is unavailable.
(() => {
  const main = document.querySelector('main');
  if (!main || /^(p6|p7)-/.test(document.body.dataset.page || '')) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 767px)');
  const animations = new Set();
  const cleanups = [];
  const once = new WeakSet();
  const easing = 'cubic-bezier(.22,1,.36,1)';
  let observer;

  function animate(element, frames, options = {}) {
    if (preference.matches || !element.animate || !element.getClientRects().length) return;
    const animation = element.animate(frames, { duration: 650, easing, ...options });
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  }

  function count(element) {
    const original = element.textContent;
    const match = original.match(/^\s*(\d+(?:\.\d+)?)(.*)$/);
    if (!match || preference.matches) return;
    const final = Number(match[1]);
    const decimals = match[1].includes('.') ? match[1].split('.')[1].length : 0;
    const spoken = document.createElement('span');
    spoken.className = 'motion-sr-only';
    spoken.textContent = original;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    visual.textContent = original;
    element.style.minWidth = `${element.getBoundingClientRect().width}px`;
    element.classList.add('motion-count');
    element.replaceChildren(spoken, visual);
    let frame, start;
    const finish = () => { cancelAnimationFrame(frame); visual.textContent = original; };
    cleanups.push(finish);
    function tick(time) {
      start ??= time;
      const progress = Math.min(1, (time - start) / 1050);
      visual.textContent = (final * (1 - (1 - progress) ** 3)).toFixed(decimals) + match[2];
      if (progress < 1 && !preference.matches) frame = requestAnimationFrame(tick);
      else finish();
    }
    frame = requestAnimationFrame(tick);
  }

  function reveal(element) {
    if (once.has(element)) return;
    once.add(element);
    if (element.matches('[data-count]')) { count(element); return; }
    if (element.matches('.process-steps > li')) element.classList.add('process-complete');
  }

  const hero = main.querySelector('.motion-hero');
  if (hero) {
    const slides = [...hero.querySelectorAll('.hero-slide')];
    const controls = hero.querySelector('.hero-slider-controls');
    if (slides.length > 1 && controls) {
      const dots = [...controls.querySelectorAll('[data-slide]')];
      const toggle = controls.querySelector('[data-slide-toggle]');
      const status = controls.querySelector('[data-slide-status]');
      let active = 0, timer, paused = preference.matches, hovering = false, focused = false, visible = true;
      const unavailable = new Set();
      const stop = () => { clearTimeout(timer); timer = undefined; };
      function schedule() {
        stop();
        if (mobile.matches || paused || hovering || focused || !visible || document.hidden || unavailable.size >= slides.length - 1) return;
        timer = setTimeout(() => show((active + 1) % slides.length), 6000);
      }
      function show(index, manual = false) {
        for (let attempts = 0; unavailable.has(index) && attempts < slides.length; attempts++) index = (index + 1) % slides.length;
        if (unavailable.has(index)) return;
        active = index;
        slides.forEach((slide, position) => slide.classList.toggle('is-active', position === active));
        dots.forEach((dot, position) => dot.setAttribute('aria-pressed', String(position === active)));
        if (manual) status.textContent = `${active + 1} / ${slides.length} · ${dots[active].dataset.slideName}`;
        schedule();
      }
      function updateToggle() {
        toggle.textContent = paused ? '▶ 재생' : 'Ⅱ 일시정지';
        toggle.setAttribute('aria-label', paused ? '메인 사진 자동 전환 재생' : '메인 사진 자동 전환 일시정지');
      }
      dots.forEach((dot, index) => dot.addEventListener('click', () => show(index, true)));
      toggle.addEventListener('click', () => { paused = !paused; updateToggle(); schedule(); });
      controls.addEventListener('mouseenter', () => { hovering = true; stop(); });
      controls.addEventListener('mouseleave', () => { hovering = false; schedule(); });
      hero.addEventListener('focusin', () => { focused = true; stop(); });
      hero.addEventListener('focusout', event => { focused = hero.contains(event.relatedTarget); schedule(); });
      document.addEventListener('visibilitychange', schedule);
      preference.addEventListener('change', () => { if (preference.matches) { paused = true; updateToggle(); stop(); } });
      slides.forEach((slide, index) => {
        const failed = () => { unavailable.add(index); dots[index].disabled = true; if (active === index) show((index + 1) % slides.length); else schedule(); };
        slide.addEventListener('error', failed);
        if (slide.complete && !slide.naturalWidth) failed();
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }).observe(hero);
      }
      function updateViewport() {
        controls.hidden = mobile.matches;
        if (mobile.matches) show(0);
        else schedule();
      }
      mobile.addEventListener('change', updateViewport);
      updateViewport();
      updateToggle();
      schedule();
      window.addEventListener('pagehide', stop);
    }
  }
  if (hero && !preference.matches && !mobile.matches) {
    document.body.classList.add('motion-enabled');
    const photo = hero.querySelector('img');
    if (photo) animate(photo, [{ transform: 'scale(1.055)' }, { transform: 'scale(1)' }], { duration: 1400 });
    hero.querySelectorAll('[data-hero-part]').forEach((element, index) => {
      once.add(element);
      animate(element, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: index * 100, duration: 700, fill: 'backwards' });
    });
  }

  const ticker = main.querySelector('.hospital-ticker');
  if (ticker) {
    const toggle = ticker.querySelector('.hospital-ticker-toggle');
    let paused = false, visible = false;
    const updateTicker = () => {
      ticker.dataset.paused = String(paused || !visible || document.hidden || mobile.matches || preference.matches);
      toggle.disabled = preference.matches;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.textContent = preference.matches ? '자동 이동 꺼짐' : paused ? '재생' : '일시정지';
    };
    toggle.addEventListener('click', () => { paused = !paused; updateTicker(); });
    if ('IntersectionObserver' in window) {
      const tickerObserver = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        updateTicker();
      });
      tickerObserver.observe(ticker);
    } else visible = true;
    document.addEventListener('visibilitychange', updateTicker);
    mobile.addEventListener('change', updateTicker);
    preference.addEventListener('change', updateTicker);
    updateTicker();
  }

  // Only counters and process connector lines respond to scrolling.
  const targets = main.querySelectorAll('[data-count], .process-steps > li');
  if (!preference.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    }), { threshold: 0, rootMargin: '0px 0px -36px 0px' });
    targets.forEach(element => { if (!once.has(element)) observer.observe(element); });
  } else main.querySelectorAll('.process-steps > li').forEach(element => element.classList.add('process-complete'));

  preference.addEventListener('change', () => {
    if (!preference.matches) return;
    document.body.classList.remove('motion-enabled');
    observer?.disconnect();
    animations.forEach(animation => animation.cancel());
    cleanups.forEach(finish => finish());
    main.querySelectorAll('.process-steps > li').forEach(element => element.classList.add('process-complete'));
  });
})();
