(() => {
  "use strict";
  const group = document.getElementById("kt-theme-controls");
  const toggle = group?.querySelector(".quarto-color-scheme-toggle");
  const auto = document.getElementById("kt-theme-auto");
  const tools = document.querySelector("#quarto-header .quarto-navbar-tools");
  const drawer = document.getElementById("navbarCollapse");
  if (!group || !toggle || !auto || !tools || !drawer) return;
  const english = document.documentElement.lang.startsWith("en");
  const narrow = matchMedia("(max-width: 991px)");
  const sync = () => {
    const dark = document.body.classList.contains("quarto-dark");
    const label = english
      ? (dark ? "Switch to light mode" : "Switch to dark mode")
      : (dark ? "切换至浅色模式" : "切换至深色模式");
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    try {
      auto.setAttribute("aria-pressed", String(localStorage.getItem("quarto-color-scheme") === null));
    } catch {
      auto.setAttribute("aria-pressed", "true");
    }
  };
  const place = () => {
    if (narrow.matches) drawer.append(group);
    else drawer.insertBefore(group, drawer.querySelector(".navbar-nav.ms-auto"));
  };
  // Quarto retains ownership of the toggle, native classes, stylesheets and preference.
  toggle.setAttribute("role", "button");
  toggle.removeAttribute("href");
  toggle.tabIndex = 0;
  toggle.addEventListener("keydown", event => {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); toggle.click(); }
  });
  auto.addEventListener("click", () => {
    try {
      localStorage.removeItem("quarto-color-scheme");
      // As in DW, native initialization resets its system sentinel as well as the sheets.
      location.reload();
    } catch { sync(); }
  });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  narrow.addEventListener("change", place);
  place();
  sync();
})();
