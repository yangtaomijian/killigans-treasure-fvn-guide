(() => {
  "use strict";
  const button = document.querySelector("#quarto-header .navbar-toggler");
  const panel = document.getElementById("navbarCollapse");
  const closeButton = document.getElementById("kt-global-nav-close");
  const pageTrigger = document.getElementById("kt-page-toc-trigger");
  const searchLauncher = document.getElementById("kt-search-launcher");
  const backdrop = document.getElementById("kt-global-nav-backdrop");
  const header = document.getElementById("quarto-header");
  if (!button || !panel || !closeButton || !searchLauncher || !backdrop || !header) return;

  const narrow = matchMedia("(max-width: 991px)");
  const groupToggles = [...panel.querySelectorAll(".nav-item.dropdown > .dropdown-toggle")];
  // The destination owns aria-current; its parent only borrows a visual state.
  for (const toggle of groupToggles) {
    const current = [...toggle.nextElementSibling.querySelectorAll("a[href]")]
      .find(link => new URL(link.href, location.href).pathname === location.pathname);
    if (!current) continue;
    current.setAttribute("aria-current", "page");
    toggle.classList.add("kt-section-active");
  }
  const groupBootstrapToggle = new Map(groupToggles.map(toggle => [toggle, toggle.getAttribute("data-bs-toggle")]));
  // Destination directories identify the existing groups across both locales;
  // generated menu IDs and translated labels are not stable identities.
  const groupKeys = new Map(groupToggles.map(toggle => {
    const destination = toggle.nextElementSibling.querySelector("a[href]");
    return [toggle, new URL("./", destination.href).pathname.replace(/\/en\//, "/")];
  }));
  const groupStorageKey = "kt-global-nav-groups-v1";
  const groupPreferences = Object.create(null);
  try {
    const saved = JSON.parse(localStorage.getItem(groupStorageKey));
    for (const key of groupKeys.values()) {
      if (saved && typeof saved[key] === "boolean") groupPreferences[key] = saved[key];
    }
  } catch {
    // Storage is optional; toggling and reopening still work on this page.
  }
  const locale = closeButton.getAttribute("aria-label") === "Close navigation" ? "en" : "zh";
  const labels = locale === "en"
    ? { open: "Open navigation", close: "Close navigation" }
    : { open: "打开导航", close: "关闭导航" };
  const inertBefore = new Map();
  let scrollBefore = 0;

  function updateTop() {
    const bounds = header.getBoundingClientRect();
    const bottom = bounds.top < 0 && bounds.bottom <= 0 ? 0 : Math.max(0, bounds.bottom);
    document.documentElement.style.setProperty("--kt-global-nav-top", `${Math.min(bottom, innerHeight)}px`);
  }

  function backgroundNodes() {
    return [...document.body.children]
      .filter(node => node !== header && node.tagName !== "SCRIPT" && node.tagName !== "STYLE" && node.tagName !== "DIALOG");
  }

  function setBackgroundInert() {
    for (const node of backgroundNodes()) {
      inertBefore.set(node, node.inert);
      node.inert = true;
    }
  }

  function restoreBackground() {
    for (const [node, prior] of inertBefore) node.inert = prior;
    inertBefore.clear();
  }

  function resetGroups() {
    for (const toggle of groupToggles) {
      toggle.classList.remove("show");
      toggle.setAttribute("aria-expanded", "false");
      toggle.nextElementSibling?.classList.remove("show");
    }
  }

  function restoreGroups() {
    for (const toggle of groupToggles) {
      const expanded = groupPreferences[groupKeys.get(toggle)] === true;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.classList.toggle("show", expanded);
      toggle.nextElementSibling?.classList.toggle("show", expanded);
    }
  }

  function setGroupMode() {
    for (const toggle of groupToggles) {
      const original = groupBootstrapToggle.get(toggle);
      if (narrow.matches) toggle.removeAttribute("data-bs-toggle");
      else if (original !== null) toggle.setAttribute("data-bs-toggle", original);
    }
  }

  function cleanCollapse() {
    panel.classList.remove("show", "collapsing");
    panel.style.removeProperty("height");
  }

  function close(returnFocus = true) {
    if (!document.body.classList.contains("kt-global-nav-open")) return;
    document.body.classList.remove("kt-global-nav-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", labels.open);
    restoreBackground();
    resetGroups();
    cleanCollapse();
    if (returnFocus && narrow.matches) button.focus({ preventScroll: true });
    if (window.scrollY !== scrollBefore) window.scrollTo(0, scrollBefore);
  }

  function open() {
    if (!narrow.matches || document.body.classList.contains("kt-global-nav-open")) return;
    document.dispatchEvent(new CustomEvent("kt:global-nav-opening"));
    cleanCollapse();
    restoreGroups();
    updateTop();
    scrollBefore = window.scrollY;
    document.body.classList.add("kt-global-nav-open");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", labels.close);
    setBackgroundInert();
    closeButton.focus({ preventScroll: true });
  }

  const focusable = () => [...new Set([button, closeButton, ...panel.querySelectorAll('a[href], .quarto-color-scheme-toggle[role=button], #kt-theme-auto'),
    ...(document.documentElement.classList.contains("kt-two-tier-mobile")
      ? document.querySelectorAll('#kt-theme-controls [role=button], #kt-theme-auto') : []), pageTrigger, searchLauncher])]
    .filter(node => node && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");

  button.addEventListener("click", () => {
    if (!narrow.matches) return;
    if (document.body.classList.contains("kt-global-nav-open")) close();
    else open();
  });
  closeButton.addEventListener("click", () => close());
  backdrop.addEventListener("click", () => close());
  panel.addEventListener("click", event => {
    if (!narrow.matches) return;
    if (event.target.closest('a[href]:not(.dropdown-toggle):not(.quarto-color-scheme-toggle)')) close(false);
  });
  panel.addEventListener("click", event => {
    if (!narrow.matches) return;
    const toggle = event.target.closest(".nav-item.dropdown > .dropdown-toggle");
    if (!toggle || !panel.contains(toggle)) return;
    event.preventDefault();
    event.stopPropagation();
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.classList.toggle("show", !expanded);
    toggle.nextElementSibling?.classList.toggle("show", !expanded);
    groupPreferences[groupKeys.get(toggle)] = !expanded;
    try {
      localStorage.setItem(groupStorageKey, JSON.stringify(groupPreferences));
    } catch {
      // Keep the current-page preference when browser storage is unavailable.
    }
  }, true);
  panel.addEventListener("keydown", event => {
    if (!narrow.matches || event.key !== " ") return;
    const toggle = event.target.closest(".nav-item.dropdown > .dropdown-toggle");
    if (!toggle || !panel.contains(toggle)) return;
    event.preventDefault();
    toggle.click();
  });
  document.addEventListener("keydown", event => {
    if (!document.body.classList.contains("kt-global-nav-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!items.length) return;
    if (document.documentElement.classList.contains("kt-two-tier-mobile")) {
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      return;
    }
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  });
  document.addEventListener("kt:page-toc-opening", () => close(false));
  document.addEventListener("kt:search-opening", () => close(false));
  narrow.addEventListener("change", () => {
    if (!narrow.matches) close(false);
    resetGroups();
    cleanCollapse();
    setGroupMode();
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", labels.open);
    updateTop();
  });
  window.addEventListener("resize", updateTop);
  updateTop();
  cleanCollapse();
  setGroupMode();
})();
