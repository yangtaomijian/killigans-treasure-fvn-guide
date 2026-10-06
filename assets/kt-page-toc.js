(() => {
  "use strict";
  const trigger = document.getElementById("kt-page-toc-trigger");
  const panel = document.getElementById("kt-page-toc-panel");
  const toc = document.getElementById("TOC");
  const closeButton = document.getElementById("kt-page-toc-close");
  const backdrop = document.getElementById("kt-page-toc-backdrop");
  const header = document.getElementById("quarto-header");
  const article = document.getElementById("quarto-document-content");
  if (!trigger || !panel || !toc || !closeButton || !backdrop || !header || !article) return;

  const narrow = window.matchMedia("(max-width: 991px)");
  // Keep the viewport rail below the actual masthead, including font changes.
  function desktopOffset() {
    if (!narrow.matches) document.documentElement.style.setProperty(
      "--kt-desktop-header-height", `${header.getBoundingClientRect().bottom}px`);
  }
  new ResizeObserver(desktopOffset).observe(header);
  narrow.addEventListener("change", desktopOffset);
  desktopOffset();
  // A desktop choice lasts only for this tab's session and is shared by locales.
  const desktopKey = "kt-desktop-toc-collapsed-v1";
  let desktopCollapsed = false;
  const english = document.documentElement.lang.startsWith("en");
  const collapseDesktop = document.createElement("button");
  const expandDesktop = document.createElement("button");
  collapseDesktop.id = "kt-desktop-toc-collapse";
  expandDesktop.id = "kt-desktop-toc-expand";
  for (const button of [collapseDesktop, expandDesktop]) {
    button.type = "button";
    button.setAttribute("aria-controls", panel.id);
  }
  collapseDesktop.textContent = english ? "Collapse" : "收起";
  expandDesktop.textContent = english ? "Expand TOC" : "展开目录";
  collapseDesktop.setAttribute("aria-label", english ? "Collapse table of contents" : "收起本页目录");
  expandDesktop.setAttribute("aria-label", english ? "Expand table of contents" : "展开本页目录");
  const toolbar = document.createElement("div");
  toolbar.className = "kt-desktop-toc-toolbar";
  const title = document.createElement("span");
  title.textContent = toc.querySelector("#toc-title")?.textContent || (english ? "On this page" : "本页目录");
  toolbar.append(title);
  toolbar.append(collapseDesktop);
  panel.prepend(toolbar);
  document.body.append(expandDesktop);
  // Desktop branch choices belong to the reader, independently of scrollspy.
  const branchLists = [...toc.querySelectorAll("ul")], branches = [];
  const tocLinks = [...toc.querySelectorAll("a.nav-link")];
  const originalCurrent = new Map(tocLinks.map(link => [link, link.getAttribute("aria-current")]));
  toc.querySelectorAll("li").forEach((item, index) => {
    const link = item.querySelector(":scope > a.nav-link[data-scroll-target]");
    const list = item.querySelector(":scope > ul");
    if (!link) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(link.dataset.scrollTarget.slice(1))); } catch { return; }
    const heading = target?.matches("section") ? target.querySelector(":scope > :is(h1,h2,h3,h4)") : target;
    if (heading?.matches("h1,h2,h3,h4")) {
      const level = heading.tagName.slice(1);
      link.dataset.ktTocLevel = level;
      item.classList.add(`kt-toc-level${level}`);
    }
    if (!list || heading?.tagName !== "H2") return;
    if (!list.id) list.id = `kt-toc-subsections-${index}`;
    const label = link.textContent.trim(), button = document.createElement("button");
    button.type = "button"; button.className = "kt-toc-branch-toggle";
    button.setAttribute("aria-controls", list.id);
    item.classList.add("kt-toc-branch");
    // Keep the link immediately before its list for Quarto's mobile walk.
    item.insertBefore(button, link);
    const arrow = document.createElement("span"); arrow.setAttribute("aria-hidden", "true"); button.append(arrow);
    list.classList.add("kt-toc-managed-branch");
    const branch = {item, link, list, button, arrow, label, collapsed:false, originalHidden:list.getAttribute("aria-hidden")};
    branches.push(branch);
    button.addEventListener("click", () => {
      if (narrow.matches) return;
      branch.collapsed = !branch.collapsed;
      applyBranches();
    });
  });
  const roots = toc.querySelectorAll(":scope > ul > li");
  if (roots.length === 1 && roots[0].classList.contains("kt-toc-level1"))
    roots[0].classList.add("kt-toc-page-root");
  function branchIndicators() {
    for (const branch of branches) {
      const containsActive = !narrow.matches && !!branch.list.querySelector("a.active");
      if (branch.item.classList.contains("kt-toc-active-branch") !== containsActive)
        branch.item.classList.toggle("kt-toc-active-branch", containsActive);
      if (branch.link.classList.contains("kt-toc-parent") !== containsActive)
        branch.link.classList.toggle("kt-toc-parent", containsActive);
    }
    const active = toc.querySelector("a.nav-link.active");
    for (const link of tocLinks) {
      const current = !narrow.matches && link === active ? "location" : originalCurrent.get(link);
      if (current === null) link.removeAttribute("aria-current");
      else if (link.getAttribute("aria-current") !== current) link.setAttribute("aria-current", current);
    }
  }
  function applyBranches() {
    const desktop = !narrow.matches;
    toc.dataset.ktDesktopBranches = String(desktop);
    for (const list of branchLists) {
      list.hidden = false;
      // Native Quarto collapse classes remain independent of desktop choices.
    }
    for (const branch of branches) {
      branch.button.hidden = !desktop;
      branch.list.dataset.desktopExpanded = String(!branch.collapsed);
      if (desktop) branch.list.setAttribute("aria-hidden", String(branch.collapsed));
      else if (branch.originalHidden === null) branch.list.removeAttribute("aria-hidden");
      else branch.list.setAttribute("aria-hidden", branch.originalHidden);
      branch.arrow.textContent = branch.collapsed ? "▸" : "▾";
      branch.button.setAttribute("aria-expanded", String(!branch.collapsed));
      branch.button.setAttribute("aria-label", english
        ? `${branch.collapsed ? "Expand" : "Collapse"} subsections: ${branch.label}`
        : `${branch.collapsed ? "展开" : "收起"}子目录：${branch.label}`);
    }
    branchIndicators();
    document.dispatchEvent(new Event("kt:toc-branch-mode-change"));
  }
  narrow.addEventListener("change", applyBranches);
  applyBranches();
  // Reveal the active desktop link at an edge, never center it.
  // Browsing the TOC pauses following until explicit reading input or navigation.
  let followPaused = false, followFrame = 0;
  function followActive() {
    followFrame = 0;
    if (narrow.matches || followPaused || panel.inert ||
        !panel.getClientRects().length) return;
    let active = toc.querySelector("a.nav-link.active");
    // A manually folded current subsection follows its visible branch label.
    while (active && !active.getClientRects().length)
      active = active.closest("ul")?.parentElement?.querySelector(":scope > a.nav-link");
    if (!active) return;
    const rail = panel.getBoundingClientRect(), link = active.getBoundingClientRect();
    const top = Math.max(rail.top, toolbar.getBoundingClientRect().bottom) + 24;
    const bottom = rail.bottom - 24;
    // Long labels fit from the upper edge; normal links move only far enough.
    const delta = link.height > bottom - top || link.top < top ? link.top - top
      : link.bottom > bottom ? link.bottom - bottom : 0;
    const next = Math.max(0, Math.min(panel.scrollHeight - panel.clientHeight, panel.scrollTop + delta));
    if (Math.abs(next - panel.scrollTop) > 1) panel.scrollTo({top:next,behavior:"instant"});
  }
  function queueFollow() {
    if (!followFrame) followFrame = requestAnimationFrame(followActive);
  }
  function pauseFollow() { if (!narrow.matches) followPaused = true; }
  function resumeFollow() { followPaused = false; queueFollow(); }
  panel.addEventListener("pointerenter", event => {
    // Reopening places the rail under the stationary pointer. Its entry from
    // the now-hidden opener is not a fresh attempt to browse the directory.
    const opener = event.relatedTarget?.closest?.("#kt-desktop-toc-expand");
    if (opener === expandDesktop && opener.hidden &&
        opener.getAttribute("aria-controls") === panel.id) return;
    pauseFollow();
  });
  panel.addEventListener("pointerdown", pauseFollow, {passive:true});
  panel.addEventListener("wheel", pauseFollow, {passive:true});
  panel.addEventListener("focusin", event => {
    if (event.target.closest("#TOC")) pauseFollow();
  });
  const readingInput = event => {
    if (narrow.matches || panel.contains(event.target)) return;
    if (article.contains(event.target) || event.target.closest?.("footer.footer")) resumeFollow();
  };
  document.addEventListener("wheel", readingInput, {capture:true,passive:true});
  document.addEventListener("touchstart", readingInput, {capture:true,passive:true});
  document.addEventListener("pointerdown", event => {
    // The browser's outer scrollbar reports the root element as its target.
    if (event.target === document.documentElement) resumeFollow();
  }, {passive:true});
  document.addEventListener("keydown", event => {
    if (!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) ||
        panel.contains(event.target) || event.target.closest?.('input,textarea,select,[contenteditable="true"],#kt-search-dialog')) return;
    if (article.contains(event.target) || event.target === document.body || event.target === document.documentElement) resumeFollow();
  });
  toc.addEventListener("click", event => {
    if (!narrow.matches && event.target.closest("a.nav-link")) resumeFollow();
  });
  new MutationObserver(() => { branchIndicators(); queueFollow(); }).observe(toc, {subtree:true,attributes:true,attributeFilter:["class"]});
  const followResize = new ResizeObserver(queueFollow);
  followResize.observe(panel); followResize.observe(toc);
  panel.addEventListener("scroll", queueFollow, {passive:true});
  window.addEventListener("resize", queueFollow);
  window.addEventListener("quarto-sectionChanged", queueFollow);
  function applyDesktop() {
    try { desktopCollapsed = sessionStorage.getItem(desktopKey) === "1"; } catch {}
    const hidden = !narrow.matches && desktopCollapsed;
    const hadFocus = panel.contains(document.activeElement) || document.activeElement === expandDesktop;
    document.body.classList.toggle("kt-desktop-toc-collapsed", hidden);
    panel.inert = hidden;
    if (hidden) panel.setAttribute("aria-hidden", "true");
    else panel.removeAttribute("aria-hidden");
    for (const button of [collapseDesktop, expandDesktop]) button.setAttribute("aria-expanded", String(!hidden));
    expandDesktop.hidden = !hidden;
    queueFollow();
    if (hadFocus) (narrow.matches ? trigger : hidden ? expandDesktop : collapseDesktop).focus({preventScroll:true});
  }
  function setDesktop(collapsed) {
    desktopCollapsed = collapsed;
    try { sessionStorage.setItem(desktopKey, collapsed ? "1" : "0"); } catch {}
    applyDesktop();
    (collapsed ? expandDesktop : collapseDesktop).focus({preventScroll:true});
    if (!collapsed) resumeFollow();
  }
  collapseDesktop.addEventListener("click", () => setDesktop(true));
  expandDesktop.addEventListener("click", () => setDesktop(false));
  narrow.addEventListener("change", applyDesktop);
  window.addEventListener("pageshow", applyDesktop);
  applyDesktop();
  const background = [header, article];
  const focusable = () => [closeButton, ...toc.querySelectorAll("a.nav-link")]
    .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");

  function close(returnFocus = true) {
    if (!document.body.classList.contains("kt-page-toc-open")) return;
    document.body.classList.remove("kt-page-toc-open");
    trigger.setAttribute("aria-expanded", "false");
    for (const node of background) node.inert = false;
    if (returnFocus && narrow.matches) trigger.focus({ preventScroll: true });
  }

  function open() {
    if (!narrow.matches || document.body.classList.contains("kt-page-toc-open")) return;
    document.dispatchEvent(new CustomEvent("kt:page-toc-opening"));
    document.body.classList.add("kt-page-toc-open");
    trigger.setAttribute("aria-expanded", "true");
    for (const node of background) node.inert = true;
    closeButton.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", open);
  document.addEventListener("kt:global-nav-opening", () => close(false));
  document.addEventListener("kt:search-opening", () => close(false));
  closeButton.addEventListener("click", () => close());
  backdrop.addEventListener("click", () => close());
  toc.addEventListener("click", event => {
    if (narrow.matches && event.target.closest("a.nav-link")) close();
  });
  document.addEventListener("keydown", event => {
    if (!document.body.classList.contains("kt-page-toc-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  });
  narrow.addEventListener("change", () => {
    if (!narrow.matches) close(false);
  });
})();
