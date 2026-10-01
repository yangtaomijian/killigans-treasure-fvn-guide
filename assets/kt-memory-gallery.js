"use strict";
// DW collection pattern adapted to KT's existing category/page links and row IDs.
// No catalog JSON: source rows own titles, order, scenes and acquisition links.
(() => {
  const locator = document.getElementById('kt-memory-locator');
  if (!locator || document.getElementById('kt-memory-gallery')) return;
  const en = document.documentElement.lang.startsWith('en');
  const words = en ? {
    title: 'Browse Memories / Gallery', category: 'Gallery categories', pages: 'Gallery pages',
    prompt: 'Select an entry to view its scene and acquisition details.', previous: 'Previous page', next: 'Next page',
    table: 'View this entry in the full table', page: (n,total) => `Page ${n} of ${total}`, entries: 'Memory entries', detail: 'Selected Memory',
    layout: 'Entries follow the in-game order in 4 columns × 3 rows. “—” means there is no entry in that slot.',
    empty: (row,col) => `Row ${row}, column ${col}: empty slot`
  } : {
    title: '浏览 Memories / Gallery', category: 'Gallery 分类', pages: 'Gallery 分页',
    prompt: '选择一个条目，查看场景与取得方式。', previous: '上一页', next: '下一页',
    table: '在完整表格中查看这条', page: (n,total) => `第 ${n} / ${total} 页`, entries: 'Memory 条目', detail: '选中的 Memory',
    layout: '按游戏内顺序以 4 列 × 3 行显示。「—」表示该位置没有条目。',
    empty: (row,col) => `第 ${row} 行，第 ${col} 列：无条目`
  };
  words.icon = en ? 'In-game icon' : '游戏内标记';
  words.none = en ? 'No relationship icon' : '无关系图标';
  words.single = en ? 'Single' : '单身';
  words.singleIcon = en ? 'Single icon' : '单身图标';
  words.relationshipIcon = name => en ? `${name} relationship icon` : `${name} 关系图标`;
  words.acquisition = en ? 'Scene and acquisition' : '场景与取得';
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const clean = text => text.replace(/\s+/g, ' ').trim();
  const links = [...locator.querySelectorAll('a[href]')];
  const rows = [...document.querySelectorAll('tr[id^="memory-"][data-memory-category]')];
  const groups = [], records = new Map(), pages = new Map();
  // Public v0.57a Memory viewer uses a 4 by 4 grid,
  // without transpose. Missing children are trailing empty slots.
  const columns = 4, slotsPerPage = 16;
  try {
    if (links.length !== 11 || rows.length !== 87) throw Error('Public Memory shape changed');
    for (const link of links) {
      const anchor = new URL(link.href).hash.slice(1);
      const label = clean(link.textContent);
      const name = label.replace(/\s*\(p\.\d+\)/, '');
      let group = groups.find(group => group.name === name);
      if (!group) { group = {name, pages: []}; groups.push(group); }
      const entries = rows.filter(row => row.dataset.memoryCategory === anchor);
      if (!entries.length || entries.length > slotsPerPage || pages.has(anchor)) throw Error('Invalid category/page size');
      const page = {anchor, label, entries, group, index: group.pages.length};
      group.pages.push(page); pages.set(anchor, page);
      let previousTitle = '';
      entries.forEach((row,index) => {
        if (row.cells.length !== 3 || clean(row.cells[0].textContent) !== String(index+1) || records.has(row.id) || document.querySelectorAll(`[id="${row.id}"]`).length !== 1)
          throw Error('Invalid Memory row');
        const publicTitle = clean(row.cells[1].textContent);
        const same = publicTitle.match(/^(?:同一|Same)\s+(Day\s+[\d-]+)\s*(?:标题|title)/);
        const nativeTitle = same ? previousTitle : clean(row.cells[1].querySelector('code')?.textContent || publicTitle);
        if (same && (!nativeTitle || !nativeTitle.endsWith(same[1]))) throw Error('Unresolved repeated Memory title');
        const marker = /Macsen/.test(publicTitle.replace(nativeTitle, '')) ? 'Macsen' :
          /Zhokhar/.test(publicTitle.replace(nativeTitle, '')) ? 'Zhokhar' :
          /单身图标|single icon/i.test(publicTitle) ? 'single' : '';
        const shortTitle = nativeTitle.match(/Day\s+[\d-]+$/)?.[0] || nativeTitle;
        previousTitle = nativeTitle;
        records.set(row.id, {row, page, nativeTitle, shortTitle, marker});
      });
    }
    if (records.size !== 87 || groups.length !== 8 || groups.map(g => g.pages.length).join() !== '1,1,2,1,1,1,3,1')
      throw Error('Category/page coverage changed');
  } catch (error) { console.error('Memory Gallery enhancement skipped:', error); return; }

  const gallery = el('section', 'kt-memory-gallery'); gallery.id = 'kt-memory-gallery';
  const heading = el('h2', '', words.title); heading.id = 'kt-memory-gallery-title';
  gallery.setAttribute('aria-labelledby', heading.id);
  const tabs = el('div', 'kt-gallery-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', words.category);
  const panel = el('div', 'kt-gallery-panel'); panel.id = 'kt-gallery-panel'; panel.setAttribute('role', 'tabpanel');
  const navigation = el('nav', 'kt-gallery-pages'); navigation.setAttribute('aria-label', words.pages);
  const prev = el('button', '', words.previous), next = el('button', '', words.next), pageLabel = el('span', 'kt-gallery-page-label');
  pageLabel.setAttribute('aria-live', 'polite'); pageLabel.setAttribute('aria-atomic', 'true');
  prev.type = next.type = 'button'; navigation.append(prev, pageLabel, next);
  const pageHeading = el('h3', 'kt-gallery-page-heading');
  const grid = el('ol', 'kt-gallery-grid'); grid.setAttribute('aria-label', words.entries);
  const detail = el('section', 'kt-gallery-detail'); detail.setAttribute('aria-label', words.detail); detail.setAttribute('aria-live', 'polite');
  panel.append(navigation, pageHeading, grid, detail);
  gallery.append(heading, el('p', 'kt-gallery-layout-note', words.layout));
  const markerHelp = document.querySelector('.kt-memory-marker-help');
  if (markerHelp) gallery.append(markerHelp);
  gallery.append(tabs, panel);
  let currentPage, selected = '';
  let positionReady = false, restoreTicket = 0, scrollPending = false;
  let positionKeyCounter = 0;
  const newPositionKey = () => `${Date.now()}-${++positionKeyCounter}`;

  function galleryPosition(hash = location.hash) {
    return {hash, top: tabs.getBoundingClientRect().top, markerOpen: Boolean(markerHelp?.open)};
  }
  function rememberGalleryPosition() {
    if (!positionReady || !history.state?.ktMemoryGallery) return;
    const key = history.state.ktMemoryKey || newPositionKey(), position = galleryPosition();
    if (!history.state.ktMemoryKey)
      history.replaceState({...history.state, ktMemoryKey: key, ktMemoryPosition: position}, '', location.href);
    // A quick reload can use an earlier browser-process history snapshot.
    // Keep the latest viewport per history entry in this tab's session too.
    // Scrolling must not rewrite browser history on every frame: WebKit limits
    // push/replaceState to 100 calls per ten seconds. The entry already stores
    // its initial position; this tab-local record holds subsequent scrolling.
    try { sessionStorage.setItem(`kt-memory-position:${key}`, JSON.stringify(position)); } catch {}
  }
  function savedGalleryPosition() {
    if (!history.state?.ktMemoryGallery) return null;
    let position = history.state.ktMemoryPosition;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`kt-memory-position:${history.state.ktMemoryKey}`));
      if (saved?.hash === location.hash && Number.isFinite(saved.top)) position = saved;
    } catch {}
    return position || {hash: location.hash,
      top: document.getElementById('quarto-header').getBoundingClientRect().bottom + 12,
      markerOpen: Boolean(markerHelp?.open)};
  }
  function writeHash(id, browse = true) {
    rememberGalleryPosition();
    if (location.hash === `#${id}` && Boolean(history.state?.ktMemoryGallery) === browse) return;
    history.pushState({...history.state, ktMemoryGallery: browse, ktMemoryKey: browse ? newPositionKey() : null,
      ktMemoryPosition: browse ? galleryPosition(`#${id}`) : null}, '', `#${id}`); // keep query, locale and prefix
    history.scrollRestoration = browse ? 'manual' : 'auto';
    rememberGalleryPosition();
    // pushState changes browsing state, not a native anchor landing. Quarto's
    // hashchange handler subtracts the header height, even for synthetic events.
    dispatchEvent(new CustomEvent('kt:memory-navigation'));
  }
  const tabButtons = groups.map((group, index) => {
    const button = el('button', '', group.name); button.type = 'button'; button.id = `kt-gallery-tab-${index}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => { showPage(group.pages[0]); writeHash(group.pages[0].anchor); });
    button.addEventListener('keydown', event => {
      const i = event.key === 'ArrowRight' ? (index + 1) % groups.length : event.key === 'ArrowLeft' ? (index - 1 + groups.length) % groups.length :
        event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : -1;
      if (i < 0) return;
      event.preventDefault(); tabButtons[i].click(); tabButtons[i].focus({preventScroll:true});
    });
    tabs.append(button); return button;
  });
  function clearDetail() {
    selected = '';
    grid.querySelectorAll('a[aria-current]').forEach(link => link.removeAttribute('aria-current'));
    detail.replaceChildren(el('p', 'kt-gallery-prompt', words.prompt));
  }
  function showPage(page) {
    if (currentPage === page) return;
    currentPage = page;
    clearDetail();
    tabButtons.forEach((button,index) => {
      const active = groups[index] === page.group;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabButtons[groups.indexOf(page.group)].id);
    navigation.hidden = page.group.pages.length === 1;
    prev.disabled = page.index === 0; next.disabled = page.index === page.group.pages.length - 1;
    pageLabel.textContent = words.page(page.index+1, page.group.pages.length);
    pageHeading.textContent = page.label;
    grid.replaceChildren();
    for (const row of page.entries) {
      const item = el('li'); const link = el('a', 'kt-gallery-entry'); link.href = `#${row.id}`;
      const record = records.get(row.id);
      const markerLabel = record.marker === 'single' ? words.single : record.marker;
      link.setAttribute('aria-label', `${clean(row.cells[0].textContent)} · ${record.nativeTitle}${markerLabel ? ` · ${markerLabel}` : ''}`);
      link.append(el('span', 'kt-gallery-ordinal', clean(row.cells[0].textContent)), el('span', 'kt-gallery-entry-title', record.shortTitle));
      if (markerLabel) link.append(el('span', 'kt-gallery-marker', markerLabel));
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); select(row.id); writeHash(row.id);
      });
      item.append(link); grid.append(item);
    }
    // Empty cells have no Memory identity, link or unlock claim.
    // All eleven v0.57a pages have at most 12 entries. Omit only the
    // wholly empty fourth row; preserve every earlier coordinate/empty slot.
    const visibleSlots = page.entries.length <= 12 ? 12 : slotsPerPage;
    while (grid.children.length < visibleSlots) {
      const index = grid.children.length;
      const item = el('li');
      const empty = el('span', 'kt-gallery-empty', '—');
      empty.setAttribute('aria-label', words.empty(Math.floor(index / columns)+1,index % columns+1));
      item.append(empty); grid.append(item);
    }
  }
  function select(id) {
    const record = records.get(id); if (!record) return;
    showPage(record.page);
    if (selected === id) return;
    selected = id;
    grid.querySelectorAll('a').forEach(link => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    const {row,page} = record;
    const title = el('h3', '', `${clean(row.cells[0].textContent)} · ${record.nativeTitle}`);
    const icon = record.marker === 'single' ? words.singleIcon : record.marker ? words.relationshipIcon(record.marker) : words.none;
    const meta = el('p', 'kt-gallery-meta', `${page.label} · ${words.icon}${en ? ': ' : '：'}${icon}`);
    const body = el('div', 'kt-gallery-detail-body');
    [...row.cells[2].childNodes].forEach(node => body.append(node.cloneNode(true)));
    body.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const source = el('a', 'kt-gallery-source', words.table); source.href = `#${row.id}`;
    source.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); writeHash(row.id, false); row.scrollIntoView({block:'start'});
    });
    detail.replaceChildren(title, meta, el('h4', 'kt-gallery-acquisition-title', words.acquisition), body, source);
  }
  function sync() {
    history.scrollRestoration = history.state?.ktMemoryGallery ? 'manual' : 'auto';
    let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch {}
    if (records.has(id)) select(id);
    else if (pages.has(id)) { showPage(pages.get(id)); clearDetail(); }
    else { showPage(groups[0].pages[0]); clearDetail(); }
  }
  prev.addEventListener('click', () => { const p = currentPage.group.pages[currentPage.index-1]; if (p) { showPage(p); writeHash(p.anchor); } });
  next.addEventListener('click', () => { const p = currentPage.group.pages[currentPage.index+1]; if (p) { showPage(p); writeHash(p.anchor); } });
  locator.before(gallery);
  // Return to the locator rather than the (possibly long) acquisition text.
  // Scrolling/focus reuse the stable gallery anchor without changing history.
  let floating = document.getElementById('kt-floating-actions');
  if (!floating) {
    floating = el('aside', 'kt-floating-actions'); floating.id = 'kt-floating-actions';
    floating.setAttribute('aria-label', en ? 'Quick actions' : '快捷入口');
    document.body.append(floating);
  }
  const returnButton = el('button', 'kt-gallery-return kt-floating-action--contextual', en ? '↑ Back to gallery' : '↑ 返回浏览区');
  returnButton.type = 'button'; returnButton.hidden = true;
  returnButton.setAttribute('aria-controls', gallery.id);
  returnButton.dataset.returnAnchor = gallery.id;
  floating.append(returnButton);
  heading.tabIndex = -1;
  let returnPending = false;
  const updateReturn = () => {
    returnPending = false;
    const headerBottom = document.getElementById('quarto-header').getBoundingClientRect().bottom;
    returnButton.hidden = grid.getBoundingClientRect().bottom >= Math.max(0, headerBottom) - 120;
  };
  const scheduleReturn = () => {
    if (!returnPending) { returnPending = true; requestAnimationFrame(updateReturn); }
  };
  returnButton.addEventListener('click', () => {
    // The anchor owns the return destination; tabs and selected slot provide
    // a usable reading position underneath the sticky header.
    const anchor = document.getElementById(returnButton.dataset.returnAnchor);
    if (!anchor) return;
    const target = anchor.querySelector('.kt-gallery-entry[aria-current="true"]') || heading;
    // Scrolling upward reveals a Headroom header that may currently be hidden.
    const headerBottom = document.getElementById('quarto-header').getBoundingClientRect().height;
    const top = Math.max(0, scrollY + tabs.getBoundingClientRect().top - headerBottom - 12);
    target.focus({preventScroll:true});
    scrollTo({top, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
  addEventListener('scroll', scheduleReturn, {passive:true});
  addEventListener('resize', scheduleReturn);
  new ResizeObserver(scheduleReturn).observe(gallery);
  scheduleReturn();
  function positionSource(id) {
    const target = document.getElementById(id);
    if (!target || gallery.contains(target)) return;
    const bounds = target.getBoundingClientRect();
    const header = document.getElementById('quarto-header').getBoundingClientRect();
    if (bounds.top < header.bottom - 2 || bounds.top > innerHeight - 60)
      scrollTo({top: Math.max(0, scrollY + bounds.top - header.bottom - 12), behavior:'instant'});
  }
  function restoreGalleryPosition(position) {
    if (!history.state?.ktMemoryGallery || !position || position.hash !== location.hash || !Number.isFinite(position.top)) return;
    if (markerHelp) markerHelp.open = position.markerOpen;
    scrollTo({top: Math.max(0, scrollY + tabs.getBoundingClientRect().top - position.top), behavior:'instant'});
  }
  function restoreGalleryHistory() {
    const position = savedGalleryPosition();
    if (!position) return;
    positionReady = false;
    const ticket = ++restoreTicket;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (ticket !== restoreTicket) return;
      restoreGalleryPosition(position);
      positionReady = true;
      rememberGalleryPosition();
    }));
  }
  addEventListener('hashchange', event => {
    sync();
    // Native source/category navigation may scroll before the selected page's
    // grid changes height. Gallery history restores the browsing position.
    if (event.isTrusted && !history.state?.ktMemoryGallery) {
      const hash = location.hash;
      requestAnimationFrame(() => {
        if (location.hash !== hash || history.state?.ktMemoryGallery) return;
        let id; try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
        positionSource(id);
      });
    }
    else if (event.isTrusted) restoreGalleryHistory();
  });
  addEventListener('kt:memory-navigation', sync);
  addEventListener('popstate', () => { sync(); restoreGalleryHistory(); });
  addEventListener('pageshow', sync);
  addEventListener('scroll', () => {
    if (!positionReady || scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { scrollPending = false; rememberGalleryPosition(); });
  }, {passive:true});
  // Flush the final position before a quick reload can overtake the scroll RAF.
  addEventListener('pagehide', rememberGalleryPosition);
  sync();
  // The table remains the native fragment target. Adding the browser above it
  // can move an initial landing while Quarto finishes layout and fonts.
  const initialHash = location.hash;
  // Older open tabs had only a browsing flag; savedGalleryPosition migrates
  // those reloads to the controls instead of the source table.
  const initialPosition = savedGalleryPosition();
  let interacted = false;
  const markInteraction = () => { interacted = true; };
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  inputs.forEach(type => addEventListener(type, markInteraction, {passive:true}));
  // WebKit may apply an older native scroll snapshot after load. Keep the
  // captured tab-local position and suppress writes until pageshow and its
  // layout frames have completed; otherwise that older scroll overwrites it.
  const settleInitial = () => (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    inputs.forEach(type => removeEventListener(type, markInteraction));
    try {
      if (interacted || !initialHash || location.hash !== initialHash) return;
      if (initialPosition?.hash === initialHash) { restoreGalleryPosition(initialPosition); return; }
      if (performance.getEntriesByType('navigation')[0]?.type === 'back_forward') return;
      let id; try { id = decodeURIComponent(initialHash.slice(1)); } catch { return; }
      positionSource(id);
    } finally {
      positionReady = true;
      rememberGalleryPosition();
    }
  }))));
  if (document.readyState === 'complete') settleInitial();
  else addEventListener('pageshow', settleInitial, {once:true});
})();
