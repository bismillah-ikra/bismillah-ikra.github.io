const params = new URLSearchParams(location.search);
const file = params.get('file') || '';
const back = params.get('back') || '#dersler';
const backLink = document.getElementById('back');
const download = document.getElementById('download');
const browserOpen = document.getElementById('browser-open');
const message = document.getElementById('message');
const counter = document.getElementById('counter');
const toolbar = document.querySelector('.toolbar');
const pages = document.getElementById('pages');
const pageTemplate = document.getElementById('pdf-page');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const out = document.getElementById('out');
const zoomIn = document.getElementById('in');
const zoomLabel = document.getElementById('zoom-label');
const navigationMode = document.getElementById('navigation-mode');
backLink.href = './' + (/^#dersler(?:\/|$)/.test(back) ? back : '#dersler');

let documentPdf, pageNumber = 1, zoom = 1;
const readingMode = false;
let continuous = true, slots = [], observer, scrollFrame = 0;
let navigationAnchor = null, anchorObserver, anchorTimer, anchorFrame = 0;
let source;
try {
  source = new URL(file, location.origin);
  if (source.origin !== location.origin || !/^\/materials\/[a-z-]+\/[a-z-]+\/[^/]+\.pdf$/i.test(source.pathname) || source.search || source.hash) throw new Error('Geçersiz dosya adresi.');
  const requestedVersion = params.get('version') || '';
  if (/^[a-f0-9]{16}$/.test(requestedVersion)) source.searchParams.set('v', requestedVersion);
  const filename = decodeURIComponent(source.pathname.split('/').pop()).replace(/^[a-f0-9-]{36}-/i, '');
  document.getElementById('name').textContent = filename;
  download.href = source.href;
  download.download = filename;
  download.hidden = false;
  browserOpen.href = source.href;
} catch {
  source = null;
  message.textContent = 'Dosya adresi geçersiz. Lütfen dosya listesine dönüp yeniden deneyin.';
}

function updateControls() {
  previous.disabled = !documentPdf || pageNumber <= 1;
  next.disabled = !documentPdf || pageNumber >= documentPdf.numPages;
  out.disabled = !documentPdf || zoom <= 0.75;
  zoomIn.disabled = !documentPdf || zoom >= 2.5;
  counter.textContent = documentPdf ? `${pageNumber} / ${documentPdf.numPages}` : '— / —';
  zoomLabel.textContent = `%${Math.round(zoom * 100)}`;
  navigationMode.disabled = !documentPdf;
}
function finishPage(slot, content) {
  slot.element.replaceChildren(content);
  slot.element.style.minHeight = '';
  scheduleAnchor();
}

async function drawPage(slot) {
  if (slot.drawing) return;
  const drawing = {};
  slot.drawing = drawing;
  const isCurrent = () => slot.drawing === drawing;
  const content = pageTemplate.content.cloneNode(true);
  const reading = content.querySelector('.reading');
  const sheet = content.querySelector('.sheet');
  const canvas = sheet.querySelector('canvas');
  const annotations = sheet.querySelector('.annotations');
  const note = content.querySelector('.message');
  reading.setAttribute('aria-label', `PDF sayfası ${slot.number} metni`);
  canvas.setAttribute('aria-label', `PDF sayfası ${slot.number}`);
  try {
    const page = await documentPdf.getPage(slot.number);
    if (!isCurrent()) return;
    const links = (await page.getAnnotations({ intent: 'display' })).filter(item => item.subtype === 'Link' && (item.dest || item.url));
    if (!isCurrent()) return;
    if (readingMode && !slot.forcePdf) {
      const text = await page.getTextContent();
      if (!isCurrent()) return;
      const lines = [];
      let line = '', previousItem = null;
      for (const item of text.items) {
        if (typeof item.str !== 'string') continue;
        const value = item.str;
        if (previousItem && line && value && !/\s$/.test(line) && !/^\s/.test(value)) {
          const gap = item.transform[4] - (previousItem.transform[4] + previousItem.width);
          if (gap > Math.max(1, Math.abs(item.height || 0) * .12)) line += ' ';
        }
        line += value;
        previousItem = item;
        if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; previousItem = null; }
      }
      if (line.trim()) lines.push(line.trim());
      const containsArabic = text.items.some(item => typeof item.str === 'string' && /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(item.str));
      if (!containsArabic && !links.length && lines.join('').replace(/\s/g, '').length >= 25) {
        const fragment = document.createDocumentFragment();
        const paragraphs = [];
        for (const value of lines) {
          const previousLine = paragraphs.at(-1);
          if (previousLine && previousLine.lastLength >= 55 && value.length >= 20 && !/[.!?…:;]\s*$/.test(previousLine.lastLine)) {
            previousLine.text += ' ' + value;
            previousLine.lastLine = value;
            previousLine.lastLength = value.length;
          } else {
            paragraphs.push({ text: value, lastLine: value, lastLength: value.length });
          }
        }
        for (const { text: value } of paragraphs) { const paragraph = document.createElement('p'); paragraph.dir = 'auto'; paragraph.textContent = value; fragment.append(paragraph); }
        reading.replaceChildren(fragment);
        reading.style.setProperty('--reading-zoom', zoom);
        reading.hidden = false;
        finishPage(slot, content);
        return;
      }
      note.textContent = containsArabic ? 'Arapça yazıyı korumak için PDF sayfası gösteriliyor.' : links.length ? 'Bağlantıların çalışması için PDF sayfası gösteriliyor.' : 'Bu sayfada seçilebilir metin bulunamadı; özgün sayfa gösteriliyor.';
      note.hidden = false;
    }
    if (readingMode && slot.forcePdf) {
      note.textContent = 'Bağlantının bulunduğu yeri göstermek için PDF sayfası açıldı.';
      note.hidden = false;
    }
    sheet.hidden = false;
    const base = page.getViewport({ scale: 1 });
    const width = Math.max(1, pages.clientWidth - 4);
    const scale = Math.min(1.6, width / base.width) * zoom;
    const viewport = page.getViewport({ scale });
    slot.viewport = viewport;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    sheet.classList.toggle('wide', Math.floor(viewport.width) > pages.clientWidth);
    // Attach the canvas before rendering so browser font loading is available.
    finishPage(slot, content);
    drawing.task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
    await drawing.task.promise;
    drawing.task = null;
    if (!isCurrent()) return;
    const fragment = document.createDocumentFragment();
    for (const link of links) {
      const rect = viewport.convertToViewportRectangle(link.rect);
      const anchor = document.createElement('a');
      anchor.style.left = `${Math.min(rect[0], rect[2])}px`;
      anchor.style.top = `${Math.min(rect[1], rect[3])}px`;
      anchor.style.width = `${Math.abs(rect[2] - rect[0])}px`;
      anchor.style.height = `${Math.abs(rect[3] - rect[1])}px`;
      anchor.setAttribute('aria-label', 'PDF bağlantısını aç');
      if (link.dest) {
        anchor.href = '#';
        anchor.addEventListener('click', async event => {
          event.preventDefault();
          try {
            const destination = typeof link.dest === 'string' ? await documentPdf.getDestination(link.dest) : link.dest;
            if (!destination) return;
            const index = typeof destination[0] === 'number' ? destination[0] : await documentPdf.getPageIndex(destination[0]);
            if (index >= 0 && index < documentPdf.numPages) goToPage(index + 1, destination);
          } catch { message.textContent = 'Bu bağlantı açılamadı.'; }
        });
      } else {
        try { const target = new URL(link.url); if (!['http:', 'https:'].includes(target.protocol)) continue; anchor.href = target.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; } catch { continue; }
      }
      fragment.append(anchor);
    }
    annotations.replaceChildren(fragment);
  } catch (error) {
    if (error.name !== 'RenderingCancelledException' && isCurrent()) {
      note.textContent = 'Bu sayfa görüntülenemedi. Dosyayı indirmeyi deneyebilirsiniz.';
      note.hidden = false;
      sheet.hidden = true;
      if (!slot.element.contains(note)) finishPage(slot, content);
    }
  }
}

function releasePage(slot) {
  if (!slot.drawing) return;
  slot.drawing.task?.cancel();
  slot.drawing = null;
  slot.element.style.minHeight = `${slot.element.offsetHeight}px`;
  slot.element.replaceChildren();
}

function scrollToPage(slot, destination = null) {
  let location = slot.element.getBoundingClientRect().top;
  const kind = destination?.[1]?.name;
  const pdfY = kind === 'XYZ' ? destination[3] : kind === 'FitH' || kind === 'FitBH' ? destination[2] : kind === 'FitR' ? destination[5] : null;
  const pageWrap = slot.element.querySelector('.page-wrap');
  if (pageWrap && slot.viewport && Number.isFinite(pdfY)) {
    const y = slot.viewport.convertToViewportPoint(0, pdfY)[1];
    location = pageWrap.getBoundingClientRect().top + Math.max(0, Math.min(slot.viewport.height, y));
  }
  const top = location + window.scrollY - toolbar.offsetHeight - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}

function stopAnchor() {
  navigationAnchor = null;
  anchorObserver?.disconnect();
  anchorObserver = null;
  clearTimeout(anchorTimer);
  if (anchorFrame) cancelAnimationFrame(anchorFrame);
  anchorFrame = 0;
}

function scheduleAnchor() {
  if (!navigationAnchor || anchorFrame) return;
  anchorFrame = requestAnimationFrame(() => {
    anchorFrame = 0;
    if (navigationAnchor) scrollToPage(navigationAnchor.slot, navigationAnchor.destination);
  });
}

function anchorTo(slot, destination) {
  stopAnchor();
  navigationAnchor = { slot, destination };
  anchorObserver = new ResizeObserver(scheduleAnchor);
  for (const item of slots) if (item.number <= slot.number) anchorObserver.observe(item.element);
  scheduleAnchor();
  anchorTimer = setTimeout(stopAnchor, 2500);
}
for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
  window.addEventListener(event, stopAnchor, { passive: true });
}

function refreshPages(destination = null) {
  if (!documentPdf) return;
  stopAnchor();
  observer?.disconnect();
  observer = null;
  for (const slot of slots) {
    slot.drawing?.task?.cancel();
    slot.drawing = null;
  }

  const estimate = Math.max(300, Math.min(pages.clientWidth, 900) * 1.3 * zoom);
  slots = Array.from({ length: continuous ? documentPdf.numPages : 1 }, (_, index) => {
    const number = continuous ? index + 1 : pageNumber;
    const element = document.createElement('div');
    element.className = 'pdf-page';
    element.dataset.page = number;
    element.style.minHeight = `${estimate}px`;
    return { number, element, drawing: null, forcePdf: !!destination && number === pageNumber };
  });
  const fragment = document.createDocumentFragment();
  for (const slot of slots) fragment.append(slot.element);
  pages.replaceChildren(fragment);
  pages.classList.toggle('single-page', !continuous);
  if (!continuous) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    anchorTo(slots[0], destination);
    drawPage(slots[0]);
    return;
  }

  const currentObserver = new IntersectionObserver(entries => {
    if (observer !== currentObserver) return;
    for (const entry of entries) {
      const slot = slots[Number(entry.target.dataset.page) - 1];
      if (entry.isIntersecting) drawPage(slot);
      else releasePage(slot);
    }
  }, { rootMargin: '650px 0px' });
  observer = currentObserver;
  for (const slot of slots) observer.observe(slot.element);
  anchorTo(slots[pageNumber - 1], destination);
  drawPage(slots[pageNumber - 1]);
}

function goToPage(number, destination = null) {
  if (!documentPdf || number < 1 || number > documentPdf.numPages) return;
  pageNumber = number;
  updateControls();
  if (continuous) {
    const slot = slots[number - 1];
    if (destination && readingMode && !slot.forcePdf) { releasePage(slot); slot.forcePdf = true; }
    anchorTo(slot, destination);
    drawPage(slot);
  } else refreshPages(destination);
}

window.addEventListener('scroll', () => {
  if (!continuous || !slots.length || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (!continuous || !slots.length) return;
    const readingLine = toolbar.getBoundingClientRect().bottom + 28;
    let low = 0, high = slots.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (slots[middle].element.getBoundingClientRect().bottom <= readingLine) low = middle + 1;
      else high = middle;
    }
    // At the end of the document a short last page cannot reach the reading
    // line, even when a link has scrolled as far as the browser allows.
    const lastSlot = slots[slots.length - 1];
    const atDocumentEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atDocumentEnd && lastSlot.element.getBoundingClientRect().top < window.innerHeight) low = slots.length - 1;
    if (pageNumber !== slots[low].number) {
      pageNumber = slots[low].number;
      updateControls();
    }
  });
}, { passive: true });

let swipe;
pages.addEventListener('pointerdown', event => {
  swipe = !continuous && event.pointerType === 'touch' && event.isPrimary && !event.target.closest('a, .sheet.wide')
    ? { id: event.pointerId, x: event.clientX, y: event.clientY }
    : null;
});
pages.addEventListener('pointercancel', () => { swipe = null; });
pages.addEventListener('pointerup', event => {
  if (!swipe || swipe.id !== event.pointerId) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (!continuous && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) goToPage(pageNumber + (dx < 0 ? 1 : -1));
});

navigationMode.addEventListener('change', () => { continuous = navigationMode.value === 'continuous'; refreshPages(); });
previous.addEventListener('click', () => goToPage(pageNumber - 1));
next.addEventListener('click', () => goToPage(pageNumber + 1));
out.addEventListener('click', () => { zoom = Math.max(.75, zoom - .25); updateControls(); refreshPages(); });
zoomIn.addEventListener('click', () => { zoom = Math.min(2.5, zoom + .25); updateControls(); refreshPages(); });
let resizeTimer;
let pageWidth = pages.clientWidth;
window.addEventListener('resize', () => {
  if (pageWidth === pages.clientWidth) return;
  pageWidth = pages.clientWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refreshPages, 150);
});
async function openPdf() {
  const loadingTimer = setTimeout(() => {
    message.textContent = 'Önizleme beklenenden uzun sürüyor.';
    browserOpen.hidden = false;
  }, 8000);
  try {
    const pdfjs = await import('../assets/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '../assets/pdfjs/pdf.worker.min.mjs';
    documentPdf = await pdfjs.getDocument({
      url: source.href,
      // Stream the PDF in one response instead of relying on CDN range requests.
      disableRange: true,
      cMapUrl: '../assets/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '../assets/pdfjs/standard_fonts/',
      wasmUrl: '../assets/pdfjs/wasm/',
      iccUrl: '../assets/pdfjs/iccs/'
    }).promise;
    message.textContent = '';
    browserOpen.hidden = true;
    updateControls();
    refreshPages();
  } catch {
    message.textContent = 'Önizleme açılmadı. PDF’yi tarayıcıda açabilirsin.';
    browserOpen.hidden = false;
  } finally {
    clearTimeout(loadingTimer);
  }
}

if (source) openPdf();
