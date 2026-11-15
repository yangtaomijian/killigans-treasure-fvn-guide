/* Keep the noncritical map dependency out of first-paint and header setup. */
(() => {
  const source = document.currentScript.src;
  const assets = new URL('../', source);
  const load = name => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(name, assets).href;
    script.onload = resolve;
    script.onerror = reject;
    document.body.append(script);
  });
  const start = () => setTimeout(async () => {
    try {
      await load('vendor/mermaid.min.js');
      await load('kt-story-map.js');
    } catch (error) { console.error('KT map dependency unavailable', error); }
  }, 0);
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, {once:true});
})();
