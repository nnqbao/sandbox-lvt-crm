(() => {
  const fold = (text) => String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

  const topics = [...document.querySelectorAll('.topic')];
  const parts = [...document.querySelectorAll('.part')];
  const tocParts = [...document.querySelectorAll('.toc-part')];
  const index = topics.map((topic) => ({
    topic,
    title: fold(topic.querySelector('h3')?.textContent),
    text: fold(`${topic.textContent} ${topic.dataset.keywords || ''}`),
    tocItem: document.querySelector(`.toc [data-topic="${topic.id}"]`),
  }));

  // ---------- search ----------
  const input = document.getElementById('guide-search');
  const clear = document.querySelector('.search-clear');
  const status = document.querySelector('.search-status');
  const empty = document.querySelector('.search-empty');
  const toc = document.querySelector('.toc');

  function applySearch() {
    const terms = fold(input.value).split(/\s+/).filter(Boolean);
    clear.hidden = !terms.length;
    let shown = 0;
    for (const entry of index) {
      const match = terms.every((term) => entry.text.includes(term));
      entry.topic.hidden = !match;
      if (entry.tocItem) entry.tocItem.hidden = !match;
      if (match) shown += 1;
    }
    for (const part of parts) part.hidden = !part.querySelector('.topic:not([hidden])');
    for (const item of tocParts) item.hidden = !item.querySelector('li[data-topic]:not([hidden])');
    empty.hidden = shown > 0;
    status.textContent = terms.length ? `Tìm thấy ${shown} mục` : '';
    if (terms.length && window.matchMedia('(max-width: 900px)').matches) toc.open = true;
  }

  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(applySearch, 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = topics.find((topic) => !topic.hidden);
      if (first) {
        event.preventDefault();
        first.scrollIntoView({ block: 'start' });
        first.querySelector('h3 a')?.focus({ preventScroll: true });
      }
    } else if (event.key === 'Escape') {
      input.value = '';
      applySearch();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    applySearch();
    input.focus();
  });

  // Collapse the mobile table of contents after choosing an entry.
  const mobile = window.matchMedia('(max-width: 900px)');
  if (mobile.matches) toc.open = false;
  toc.addEventListener('click', (event) => {
    if (event.target.closest('a') && mobile.matches) toc.open = false;
  });

  // ---------- current section in TOC ----------
  const tocLinks = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.getAttribute('href').slice(1), a]));
  let current = null;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const link = tocLinks.get(entry.target.id);
      if (!link || link === current) continue;
      current?.classList.remove('is-current');
      link.classList.add('is-current');
      current = link;
      if (!mobile.matches) link.scrollIntoView({ block: 'nearest' });
    }
  }, { rootMargin: '0px 0px -70% 0px' });
  topics.forEach((topic) => observer.observe(topic));

  // ---------- back to top ----------
  const backToTop = document.querySelector('.back-to-top');
  const onScroll = () => backToTop.classList.toggle('is-visible', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- lightbox ----------
  const dialog = document.querySelector('.lightbox');
  const dialogImg = dialog.querySelector('img');
  const dialogCaption = dialog.querySelector('.lightbox-caption');
  document.addEventListener('click', (event) => {
    const zoom = event.target.closest('.figure-zoom');
    if (!zoom || typeof dialog.showModal !== 'function') return;
    const img = zoom.querySelector('img');
    dialogImg.src = img.src;
    dialogImg.alt = img.alt;
    dialogCaption.textContent = zoom.closest('figure').querySelector('figcaption')?.textContent || '';
    dialog.showModal();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('.lightbox-close')) dialog.close();
  });

  // ---------- tutorial videos: chapter buttons seek and play ----------
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.video-chapters button[data-seek]');
    if (!button) return;
    const figure = button.closest('.guide-video');
    const video = figure.querySelector('video');
    const seek = () => {
      video.currentTime = Number(button.dataset.seek) || 0;
      video.play().catch(() => {});
    };
    for (const other of figure.querySelectorAll('.video-chapters button')) other.toggleAttribute('aria-current', other === button);
    if (video.readyState >= 1) seek();
    else {
      video.addEventListener('loadedmetadata', seek, { once: true });
      video.load();
    }
  });
  // Keep the tutorial videos on this device for 24 hours (public/huong-dan-sw.js); without a
  // service worker (old browser, file://, private mode) they simply stream as before.
  if (document.querySelector('.guide-video') && 'serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/huong-dan-sw.js', { scope: '/huong-dan' }).catch(() => {});
    // Safety net: a video that fails through the worker streams straight from the server instead.
    document.addEventListener('error', (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || video.dataset.direct || !navigator.serviceWorker.controller) return;
      video.dataset.direct = '1';
      video.src = video.getAttribute('src').replace(/\.mp4(?=#|$)/, '.mp4?direct=1');
      video.load();
    }, true);
  }
  // Only one video plays at a time.
  document.addEventListener('play', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    for (const other of document.querySelectorAll('.guide-video video')) if (other !== event.target) other.pause();
  }, true);

  // ---------- print: open every FAQ, show every topic ----------
  let reopen = [];
  window.addEventListener('beforeprint', () => {
    reopen = [...document.querySelectorAll('details.faq:not([open])')];
    reopen.forEach((details) => { details.open = true; });
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  });
  window.addEventListener('afterprint', () => {
    reopen.forEach((details) => { details.open = false; });
  });

  // ---------- embed mode (?embed=1, the app's "?" help panel) ----------
  // Shows only the requested topic (or part). In-guide links swap the topic
  // without adding history entries, so the app's Back button is unaffected.
  if (document.documentElement.classList.contains('is-embed')) {
    const content = document.getElementById('noi-dung');
    const initial = decodeURIComponent(location.hash.slice(1));
    const back = document.createElement('p');
    back.className = 'embed-back';
    back.hidden = true;
    content.prepend(back);
    const resolve = (id) => {
      const el = id ? document.getElementById(id) : null;
      return el ? el.closest('.topic, .part') : null;
    };
    const heading = (el) => (el.querySelector('h3, h2')?.textContent || '').trim();
    const show = (id) => {
      const target = resolve(id) || resolve(initial) || parts[0];
      if (!target) return;
      const part = target.closest('.part');
      const wholePart = target === part;
      for (const item of parts) item.hidden = item !== part;
      for (const topic of topics) topic.hidden = wholePart ? topic.closest('.part') !== part : topic !== target;
      part.classList.toggle('is-embed-part', wholePart);
      const home = resolve(initial);
      back.replaceChildren();
      back.hidden = !home || home === target;
      if (!back.hidden) {
        const link = document.createElement('a');
        link.href = `#${home.id}`;
        link.textContent = `← Quay lại: ${heading(home)}`;
        back.append(link);
      }
      const exact = id ? document.getElementById(id) : null;
      if (exact && exact !== target) exact.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    };
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      event.preventDefault();
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
      show(id);
    });
    window.addEventListener('hashchange', () => show(decodeURIComponent(location.hash.slice(1))));
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || window.parent === window || dialog.open) return;
      window.parent.postMessage({ type: 'lvt-guide:escape' }, location.origin);
    });
    show(initial);
  }
})();
