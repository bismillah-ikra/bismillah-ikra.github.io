(function () {
  'use strict';
  const { courses, extraCourseIds, folders } = globalThis.PaylasimCatalog;

  const extrasUrl = '#dersler/ek-dersler';
  const icons = {
    book: '<path d="M12 6c-2-1.6-5-2-9-1v13c3.5-1 6.6-.6 9 1 2.4-1.6 5.5-2 9-1V5c-4-1-7-.6-9 1v13"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  const main = document.getElementById('main');
  const courseById = new Map(courses);
  const esc = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const icon = key => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
  const courseUrl = (id, folder = '') =>
    (extraCourseIds.has(id) ? extrasUrl : '#dersler') + '/' + id + (folder ? '/' + folder : '');
  const currentPage = () => location.hash || '#dersler';
  const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const fileNameOrder = new Intl.Collator('tr-TR', { numeric: true });

  let files = [];
  let fileListState = 'loading';

  function forFolder(course, folder) {
    return files.filter(file => file.course === course && file.folder === folder)
      .sort((left, right) => fileNameOrder.compare(left.name, right.name));
  }

  function archiveNav({ course, folder, extras = false }) {
    const trail = [['#dersler', 'Ders Dosyaları']];
    const extraCourse = extraCourseIds.has(course);
    if (extras || extraCourse) trail.push([extrasUrl, 'Ek Dersler']);
    if (course) trail.push([courseUrl(course), courseById.get(course)]);
    if (folder) trail.push([courseUrl(course, folder), folders[folder].title]);

    const parent = trail.at(-2)[0];
    const backLabel = folder ? 'Ders sayfasına dön'
      : extraCourse ? 'Ek derslere dön'
      : 'Ders listesine dön';
    const steps = trail.map(([url, name], index) => {
      const step = index === trail.length - 1
        ? `<span aria-current="page">${esc(name)}</span>`
        : `<a href="${url}">${esc(name)}</a>`;
      return `<li>${index ? icon('chevron') : ''}${step}</li>`;
    }).join('');
    return `<div class="archive-nav">
      <a class="back-link" href="${parent}"><span class="back-link-icon">${icon('back')}</span>${backLabel}</a>
      <nav class="archive-trail" aria-label="Arşivdeki konum"><ol>${steps}</ol></nav>
    </div>`;
  }

  function arrow() { return `<span class="arrow">${icon('arrow')}</span>`; }

  function courseCard([id, name]) {
    return `
      <a class="course-card" href="${courseUrl(id)}">
        <h2>${esc(name)}</h2>
        <span class="course-card-arrow">${icon('arrow')}</span>
      </a>`;
  }

  function showCourses() {
    const cards = courses.filter(([id]) => !extraCourseIds.has(id)).map(courseCard).join('');
    const extras = `<a class="course-card extras-card" href="${extrasUrl}">
      <div><h2>Ek Dersler</h2><strong class="course-card-meta">HADİS · KELAM · TEFSİR</strong></div>
      <span class="course-card-arrow">${icon('arrow')}</span>
    </a>`;
    main.innerHTML = `
      <h1 class="course-list-heading">Dersler</h1>
      <section class="course-grid" aria-label="Ders listesi">${cards}${extras}</section>`;
  }

  function showExtraCourses() {
    const cards = courses.filter(([id]) => extraCourseIds.has(id)).map(courseCard).join('');
    main.innerHTML = archiveNav({ extras: true }) + `
      <h1 class="course-list-heading">Ek Dersler</h1>
      <section class="course-grid" aria-label="Ek ders listesi">${cards}</section>`;
  }

  function showCourse(course) {
    const cards = Object.entries(folders).map(([key, folder], index) => `
      <a class="card folder-card" href="${courseUrl(course, key)}">
        <div class="card-top"><span class="card-icon ${index ? 'tone-sand' : ''}">${icon(folder.icon)}</span>${arrow()}</div>
        <div><h3>${folder.title}</h3><p class="meta">${folder.description}</p></div>
        ${fileListState === 'ready' ? `<span class="meta">${forFolder(course, key).length} PDF</span>` : ''}
      </a>`).join('');
    main.innerHTML = archiveNav({ course }) + `
      <div class="page-head">
        <h1>${esc(courseById.get(course))}</h1>
        <p class="meta">PDF’leri görüntülemek için bir bölüm seç.</p>
        <a class="button practice-link" href="#sorular/${esc(course)}">Haftalık çalışma soruları</a>
      </div>
      <section class="grid folder-grid" aria-label="Dersin dosya bölümleri">${cards}</section>`;
  }

  function showFolder(course, folder) {
    const records = forFolder(course, folder);
    const switches = Object.entries(folders).map(([key, value]) =>
      `<a href="${courseUrl(course, key)}"${key === folder ? ' aria-current="page"' : ''}>${icon(value.icon)}${value.title}</a>`).join('');
    const rows = records.map(record => `
      <div class="file" role="listitem">
        <span class="file-icon">PDF</span>
        <div class="file-name"><strong>${esc(record.name)}</strong>
          <span class="meta">${numberFormat.format(record.size / 1024)} KB</span>
        </div>
        <div class="file-actions">
          <a href="./dersler/pdf.html?file=${encodeURIComponent(record.url)}&amp;version=${encodeURIComponent(record.version)}&amp;back=${encodeURIComponent(currentPage())}" aria-label="${esc(record.name)} dosyasını aç">Aç</a>
          <a href="${esc(record.url)}?v=${encodeURIComponent(record.version)}" download="${esc(record.name)}" aria-label="${esc(record.name)} PDF dosyasını indir">PDF indir</a>
          ${record.wordUrl ? `<a href="${esc(record.wordUrl)}" download="${esc(record.wordName)}" aria-label="${esc(record.name)} özgün Word dosyasını indir">Word indir</a>` : ''}
        </div>
      </div>`).join('');
    let fileList;
    if (fileListState === 'loading') {
      fileList = '<div class="files empty" role="status">Dosyalar yükleniyor…</div>';
    } else if (fileListState === 'error') {
      fileList = '<div class="files empty" role="status">Dosya listesi yüklenemedi. Sayfayı yenileyip tekrar dene.</div>';
    } else if (records.length) {
      fileList = `<div class="files" role="list" aria-label="PDF dosyaları">${rows}</div>`;
    } else {
      fileList = '<div class="files empty">Bu bölümde henüz PDF yok.</div>';
    }
    main.innerHTML = archiveNav({ course, folder }) + `
      <div class="page-head"><div class="eyebrow">${esc(courseById.get(course))}</div>
        <h1>${folders[folder].title}</h1>
        <p class="meta">${folders[folder].description}</p>
      </div>
      <nav class="switcher" aria-label="Dosya bölümleri">${switches}</nav>
      <div class="section-line"><h2>Dosyalar</h2>${fileListState === 'ready' ? `<span class="meta">${records.length} PDF</span>` : ''}</div>
      ${fileList}`;
  }

  function render() {
    const [, section, item, nestedFolder] = currentPage().split('/');
    const inExtras = section === 'ek-dersler';
    const course = inExtras ? item : section;
    const folder = inExtras ? nestedFolder : item;
    if (inExtras && !extraCourseIds.has(course)) showExtraCourses();
    else if (!courseById.has(course)) showCourses();
    else if (Object.hasOwn(folders, folder)) showFolder(course, folder);
    else showCourse(course);
  }

  async function loadFiles() {
    if (fileListState !== 'loading' || fileRequestStarted) return;
    fileRequestStarted = true;
    const release = document.querySelector('meta[name="site-release"]')?.content;
    const url = new URL('./dersler/files.json', location.href);
    if (release) url.searchParams.set('v', release);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Dosya listesi yüklenemedi.');
      ({ files } = await response.json());
      fileListState = 'ready';
    } catch {
      fileListState = 'error';
    }
    if (/^#dersler(?:\/|$)/.test(location.hash)) render();
  }
  let fileRequestStarted = false;
  window.LessonArchive = {
    render() {
      render();
      if (currentPage() !== '#dersler') loadFiles();
    }
  };
})();
