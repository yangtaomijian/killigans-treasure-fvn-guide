"use strict";

(() => {
  const locator = document.getElementById("kt-memory-locator");
  if (!locator) return;
  const links = [...locator.querySelectorAll("a[href]")];
  const categoryHash = link => new URL(link.href, location.href).hash;

  function updateCurrent() {
    let fragment;
    try {
      fragment = decodeURIComponent(location.hash.slice(1));
    } catch {
      fragment = "";
    }
    const row = document.getElementById(fragment);
    const category = row?.dataset.memoryCategory || (links.some(link => categoryHash(link) === `#${fragment}`) ? fragment : "");
    for (const link of links) {
      if (category && categoryHash(link) === `#${category}`) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  addEventListener("hashchange", updateCurrent);
  addEventListener("kt:memory-navigation", updateCurrent);
  addEventListener("popstate", updateCurrent);
  addEventListener("pageshow", updateCurrent);
  updateCurrent();
})();
