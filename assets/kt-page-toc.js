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
