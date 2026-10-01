(() => {
  "use strict";
  const root = document.documentElement;
  const header = document.getElementById("quarto-header");
  const container = header?.querySelector(".navbar-container");
  const tools = header?.querySelector(".quarto-navbar-tools");
  const globalTrigger = header?.querySelector(".navbar-toggler");
  const pageTrigger = document.getElementById("kt-page-toc-trigger");
  const theme = document.getElementById("kt-theme-controls");
  const drawer = document.getElementById("navbarCollapse");
  if (!container || !tools || !globalTrigger || !theme || !drawer) return;
  const narrow = matchMedia("(max-width: 991px)");
  const origins = [globalTrigger, pageTrigger].filter(Boolean).map(node => {
    const marker = document.createComment("single-tier control position");
    node.before(marker);
    return { node, marker };
  });
  const originalClick = globalTrigger.getAttribute("onclick");
  const row = document.createElement("div");
  row.id = "kt-mobile-header-row";
  const context = document.createElement("span");
  context.id = "kt-mobile-header-context";
  // Reuse the existing route breadcrumb; Home uses its existing navbar label.
  const breadcrumb = document.querySelector(".kt-page-breadcrumb ol");
  context.textContent = breadcrumb
    ? [...breadcrumb.children].map(node => node.textContent.trim()).join(" › ")
    : header.querySelector('.nav-link[aria-current="page"] .menu-text')?.textContent.trim() || "";
  context.title = context.textContent;
  row.append(context);
  container.append(row);
  let frame = 0;

  function offsets() {
    if (!narrow.matches) return;
    const bounds = header.getBoundingClientRect();
    const top = Math.min(innerHeight, Math.max(0, bounds.bottom));
    root.style.setProperty("--kt-mobile-header-height", `${header.offsetHeight}px`);
    root.style.setProperty("--kt-mobile-panel-top", `${top}px`);
    root.style.setProperty("--kt-global-nav-top", `${top}px`);
  }
  function settleOffsets() {
    cancelAnimationFrame(frame);
    const until = performance.now() + 260;
    const tick = () => {
      offsets();
      if (performance.now() < until) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  function place() {
    root.classList.toggle("kt-two-tier-mobile", narrow.matches);
    if (narrow.matches) {
      row.prepend(globalTrigger);
      if (pageTrigger) row.append(pageTrigger);
      tools.prepend(theme);
      // Leave native Headroom in charge of scrolling; avoid the collapse toggle's freeze.
      globalTrigger.removeAttribute("onclick");
    } else {
      for (const { node, marker } of origins) marker.after(node);
      drawer.insertBefore(theme, drawer.querySelector(".navbar-nav.ms-auto"));
      if (originalClick !== null) globalTrigger.setAttribute("onclick", originalClick);
      for (const name of ["--kt-mobile-header-height", "--kt-mobile-panel-top", "--kt-global-nav-top"])
        root.style.removeProperty(name);
    }
    offsets();
  }
  narrow.addEventListener("change", place);
  new ResizeObserver(offsets).observe(header);
  new MutationObserver(settleOffsets).observe(header, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", offsets);
  window.addEventListener("quarto-hrChanged", settleOffsets);
  header.addEventListener("transitionend", offsets);
  place();
})();
