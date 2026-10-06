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
    if (hadFocus) (narrow.matches ? trigger : hidden ? expandDesktop : collapseDesktop).focus({preventScroll:true});
  }
  function setDesktop(collapsed) {
    desktopCollapsed = collapsed;
    try { sessionStorage.setItem(desktopKey, collapsed ? "1" : "0"); } catch {}
    applyDesktop();
    (collapsed ? expandDesktop : collapseDesktop).focus({preventScroll:true});
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
