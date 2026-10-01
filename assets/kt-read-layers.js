/* Keep secondary explanation reachable from search and fragment/history links. */
(() => {
  'use strict';
  const sync = () => {
    const query = new URL(location.href).searchParams.get('q');
    let target;
    try { target=document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { return; }
    // Searches expand this page's secondary explanations before the search
    // highlighter scans visible text; other page disclosures remain untouched.
    if (query) document.querySelectorAll('details.kt-read-more').forEach(d => { d.open=true; });
    for (let node=target;node;node=node.parentElement) if (node.matches?.('details.kt-read-more')) node.open=true;
    if (target) requestAnimationFrame(() => {
      if (target.id.startsWith('combat-')) {
        // Empty stable markers need the same clearance as the visible heading.
        const header = document.getElementById('quarto-header');
        window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight || 0) - 16);
      } else target.scrollIntoView();
    });
  };
  sync(); window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
})();
