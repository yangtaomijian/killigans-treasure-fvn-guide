"use strict";
// Reuse the controlled Search dialog and restore focus to the Home opener.
(() => {
  const home = document.getElementById('kt-home-search');
  const launcher = document.getElementById('kt-search-launcher');
  const dialog = document.getElementById('kt-search-dialog');
  if (!home || !launcher || !dialog) return;
  let openedFromHome = false;
  home.hidden = false;
  home.addEventListener('click', () => { openedFromHome = true; launcher.click(); });
  dialog.addEventListener('close', () => {
    if (openedFromHome) { openedFromHome = false; home.focus({preventScroll: true}); }
  });
})();
