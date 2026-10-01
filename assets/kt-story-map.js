/* KT Mermaid map interaction, adapted from DW's bounded viewBox/gesture implementation.
 * Independent of Memories, Sprite Viewer, gameplay state and the diagram topology.
 */
(() => {
  'use strict';
  const en = document.documentElement.lang.startsWith('en');
  const words = en ? {fit:'Reset view', out:'Zoom out', in:'Zoom in', expand:'Full Interactive Map', full:'Browser fullscreen', close:'Close map', rotate:'Rotate for a wider view.'} :
    {fit:'重置视图', out:'缩小', in:'放大', expand:'完整互动图', full:'浏览器全屏', close:'关闭地图', rotate:'横屏可以获得更宽的视野。'};
  const zoomOutLimit = 1.6;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className=cls; if (text) node.textContent=text; return node; };
  const button = (text, action) => {const node=el('button','kt-map-button',text);node.type='button';node.addEventListener('click',action);return node;};
  function init(map, portraitSvg = null) {
    const scroller=map.querySelector('.kt-story-map-scroll');
    const bar=el('div','kt-map-controls');
    let inlineSvg;
    let inlineBox;
    const graphBoxes = new WeakMap();
    const finiteBox = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
      box.width > 0 && box.height > 0;
    const graphBox = svg => {
      if (!graphBoxes.has(svg)) {
        const b = svg.getBBox();
        const box = {x:b.x - 12, y:b.y - 12, width:b.width + 24, height:b.height + 24};
        if (finiteBox(box)) graphBoxes.set(svg, box);
      }
      return graphBoxes.get(svg);
    };
    const viewBox = svg => {
      const b = svg.viewBox.baseVal;
      return {x:b.x, y:b.y, width:b.width, height:b.height};
    };
    const writeBox = (svg, box) => {
      if (!finiteBox(box)) return false;
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
      return true;
    };
    const fitBox = svg => {
      const graph = graphBox(svg);
      if (!graph) return null;
      const rect = svg.getBoundingClientRect();
      const ratio = rect.width / rect.height;
      if (!Number.isFinite(ratio) || ratio <= 0) return graph;
      const width = Math.max(graph.width, graph.height * ratio);
      const height = width / ratio;
      return {x:graph.x + (graph.width - width)/2, y:graph.y + (graph.height - height)/2, width, height};
    };
    const clampNumber = (value, low, high) => Math.min(Math.max(value, low), high);
    const clampBox = (svg, box) => {
      const graph = graphBox(svg);
      if (!graph || !finiteBox(box)) return null;
      const axis = (start, size, graphStart, graphSize) => {
        if (size >= graphSize) {
          const centered = graphStart + (graphSize - size)/2;
          const slack = Math.min(size, graphSize) * .12;
          return clampNumber(start, centered - slack, centered + slack);
        }
        const visible = size * .8;
        return clampNumber(start, graphStart - size + visible, graphStart + graphSize - visible);
      };
      // Fit includes a 12-unit gutter. Clamp against the actual content so
      // small diagrams keep the same visible-content guarantee at max zoom.
      return {...box, x:axis(box.x, box.width, graph.x + 12, graph.width - 24),
        y:axis(box.y, box.height, graph.y + 12, graph.height - 24)};
    };
    const getSvg = () => dialog.open ? stage.querySelector('svg') : scroller.querySelector('svg');
    const fit = svg => { if (svg) writeBox(svg, fitBox(svg)); };
    const screenInverse = svg => {
      const matrix = svg.getScreenCTM();
      try { return matrix?.inverse() || null; } catch { return null; }
    };
    const screenPoint = (inverse, x, y) => new DOMPoint(x, y).matrixTransform(inverse);
    const zoom = (svg, factor, clientX, clientY) => {
      if (!svg || !Number.isFinite(factor) || factor <= 0) return;
      const before = viewBox(svg);
      const base = fitBox(svg);
      if (!finiteBox(before) || !base) return;
      const width = clampNumber(before.width * factor, base.width / 3.5, base.width * zoomOutLimit);
      const height = before.height * width / before.width;
      const inverse = screenInverse(svg);
      const focal = inverse && Number.isFinite(clientX) && Number.isFinite(clientY) ?
        screenPoint(inverse, clientX, clientY) :
        {x:before.x + before.width/2, y:before.y + before.height/2};
      const xRatio = clampNumber((focal.x - before.x)/before.width, 0, 1);
      const yRatio = clampNumber((focal.y - before.y)/before.height, 0, 1);
      writeBox(svg, clampBox(svg, {x:focal.x - xRatio*width, y:focal.y - yRatio*height, width, height}));
    };
    const zoomButton = (symbol, label, factor) => {
      const node = button(symbol, () => zoom(getSvg(), factor));
      node.setAttribute('aria-label', label);
      node.classList.add(factor > 1 ? 'kt-map-zoom-out' : 'kt-map-zoom-in');
      return node;
    };
    const resetButton = () => {
      const node = button(words.fit, () => fit(getSvg()));
      node.classList.add('kt-map-reset');
      return node;
    };
    bar.append(zoomButton('−', words.out, 1.25), zoomButton('+', words.in, .8), resetButton());
    const expand = button(words.expand, openViewer);
    expand.classList.add('kt-map-expand');
    bar.append(expand);
    scroller.before(bar);

    const dialog = el('dialog', 'kt-map-viewer');
    dialog.setAttribute('aria-label', words.expand);
    const header = el('div', 'kt-map-viewer-header');
    const title = el('strong', '', words.expand);
    const controls = el('div', 'kt-map-viewer-controls');
    const stage = el('div', 'kt-map-viewer-stage');
    const workspace = el('div', 'kt-map-viewer-workspace');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', words.expand);
    const fullscreen = button(words.full, async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await workspace.requestFullscreen();
    });
    if (!document.fullscreenEnabled) fullscreen.hidden = true;
    fullscreen.classList.add('kt-map-fullscreen');
    controls.append(zoomButton('−', words.out, 1.25), zoomButton('+', words.in, .8), resetButton(), fullscreen,
      button(words.close, () => closeViewer()));
    header.append(title, controls);
    workspace.append(header, stage, el('p', 'kt-map-rotate-hint', words.rotate));
    dialog.append(workspace);
    document.body.append(dialog);
    let opener = null;
    let savedParent = null;
    let savedNext = null;
    let viewerClosing = false;
    const compact = map.dataset.mapId === 'journey' ? matchMedia('(max-width:767.98px)') : null;
    const updateViewerLayout = () => {
      const vertical = Boolean(compact?.matches && portraitSvg);
      dialog.classList.toggle('kt-map-viewer-vertical', vertical);
      if (!dialog.open || !inlineSvg) return;
      stage.replaceChildren(vertical ? portraitSvg : inlineSvg);
      fit(getSvg());
    };
    function openViewer(event) {
      const svg = scroller.querySelector('svg');
      if (!svg || dialog.open) return;
      opener = event?.currentTarget || document.activeElement;
      savedParent = svg.parentNode;
      savedNext = svg.nextSibling;
      inlineSvg = svg;
      inlineBox = svg.getAttribute('viewBox');
      svg.remove();
      stage.append(compact?.matches && portraitSvg ? portraitSvg : svg);
      dialog.classList.toggle('kt-map-viewer-vertical', Boolean(compact?.matches && portraitSvg));
      dialog.showModal(); // Native modal behavior makes the page background inert.
      document.body.classList.add('kt-map-viewer-open');
      fit(getSvg());
      stage.focus(); // The gesture workspace is also the keyboard pan/zoom target.
    }
    async function closeViewer(restore = true) {
      if (!dialog.open || viewerClosing) return;
      viewerClosing = true;
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      if (inlineSvg && savedParent) {
        savedParent.insertBefore(inlineSvg, savedNext);
        if (inlineBox) inlineSvg.setAttribute('viewBox', inlineBox);
      }
      stage.replaceChildren();
      dialog.close();
      document.body.classList.remove('kt-map-viewer-open');
      if (restore && opener?.isConnected) opener.focus({preventScroll: true});
      viewerClosing = false;
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
    dialog.addEventListener('click', event => {
      const link = event.target.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href') || link.getAttribute('xlink:href');
      if (!href) return;
      const destination = new URL(href, location.href);
      if (destination.origin !== location.origin) return;
      const samePage = destination.pathname === location.pathname;
      const hash = destination.hash;
      event.preventDefault();
      const keyboardNavigation = event.detail === 0;
      closeViewer(false).then(() => requestAnimationFrame(() => {
        if (!samePage) { location.assign(destination.href); return; }
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (location.hash === hash) target?.scrollIntoView();
        else location.hash = hash;
        if (keyboardNavigation && target) {
          const heading = target.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4') || target;
          if (!heading.hasAttribute('tabindex')) {
            heading.tabIndex = -1;
            heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), {once:true});
          }
          heading.focus({preventScroll:true});
        }
      }));
    });
    const attachGestures = (surface, viewer) => {
      const pointers = new Map();
      let gesture = null;
      let suppressClick = false;
      surface.classList.add('kt-map-gesture-ready');
      // WebKit can start native SVG-link dragging after pan capture, stealing
      // the remaining pointer moves/up. Links here are navigation targets;
      // dragging belongs to the map surface.
      surface.addEventListener('dragstart', event => event.preventDefault());
      const capture = id => {
        // A cancelled pointer can disappear between dispatch and capture.
        try { if (!surface.hasPointerCapture(id)) surface.setPointerCapture(id); }
        catch (error) { if (error.name !== 'NotFoundError') throw error; }
      };
      const beginPan = pointer => {
        const svg = getSvg();
        if (!svg) return null;
        const inverse = screenInverse(svg);
        const box = viewBox(svg);
        return inverse && finiteBox(box) ? {kind:'pending', id:pointer.id,
          x:pointer.x, y:pointer.y, box, inverse} : null;
      };
      const beginPinch = () => {
        const svg = getSvg();
        const points = [...pointers.values()];
        const inverse = svg && screenInverse(svg);
        const box = svg && viewBox(svg);
        if (!inverse || !finiteBox(box) || points.length !== 2) return null;
        const x = (points[0].x + points[1].x)/2;
        const y = (points[0].y + points[1].y)/2;
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (!distance) return null;
        return {kind:'pinch', box, inverse, distance, focal:screenPoint(inverse, x, y)};
      };
      const finish = (event, cancelled = false) => {
        if (!pointers.has(event.pointerId)) return;
        if (!cancelled && (gesture?.kind === 'pan' || gesture?.kind === 'pinch')) {
          suppressClick = true;
          setTimeout(() => { suppressClick = false; }, 0);
        }
        pointers.delete(event.pointerId);
        if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
        surface.classList.remove('kt-map-dragging');
        gesture = pointers.size === 1 ? beginPan([...pointers.values()][0]) : null;
      };
      surface.addEventListener('click', event => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }, true);
      surface.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (pointers.has(event.pointerId) || pointers.size >= 2) return;
        const svg = getSvg();
        if (!svg || !finiteBox(viewBox(svg))) return;
        const pointer = {id:event.pointerId, x:event.clientX, y:event.clientY};
        pointers.set(event.pointerId, pointer);
        gesture = pointers.size === 2 ? beginPinch() : beginPan(pointer);
        // Delay single-pointer capture for mouse AND touch: taps on linked
        // nodes must retain their native target. Capture both fingers for pinch.
        if (pointers.size === 2) for (const id of pointers.keys()) {
          capture(id);
        }
      });
      surface.addEventListener('pointermove', event => {
        const pointer = pointers.get(event.pointerId);
        if (!pointer || !gesture) return;
        if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
          finish(event, true);
          return;
        }
        pointer.x = event.clientX; pointer.y = event.clientY;
        const svg = getSvg();
        if (!svg) return;
        if (gesture.kind === 'pinch') {
          const points = [...pointers.values()];
          if (points.length !== 2) return;
          const x = (points[0].x + points[1].x)/2;
          const y = (points[0].y + points[1].y)/2;
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          const base = fitBox(svg);
          if (!base || !Number.isFinite(distance) || distance <= 0) return;
          const width = clampNumber(gesture.box.width * gesture.distance / distance, base.width/3.5, base.width * zoomOutLimit);
          const height = gesture.box.height * width / gesture.box.width;
          const atMidpoint = screenPoint(gesture.inverse, x, y);
          const xRatio = (atMidpoint.x - gesture.box.x)/gesture.box.width;
          const yRatio = (atMidpoint.y - gesture.box.y)/gesture.box.height;
          writeBox(svg, clampBox(svg, {x:gesture.focal.x - xRatio*width,
            y:gesture.focal.y - yRatio*height, width, height}));
          surface.classList.add('kt-map-dragging');
          return;
        }
        if (gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (gesture.kind === 'pending') {
          if (Math.hypot(dx, dy) < 5) return;
          gesture.kind = 'pan';
          surface.classList.add('kt-map-dragging');
          capture(event.pointerId);
        }
        const inverse = gesture.inverse;
        writeBox(svg, clampBox(svg, {...gesture.box,
          x:gesture.box.x - inverse.a*dx - inverse.c*dy,
          y:gesture.box.y - inverse.b*dx - inverse.d*dy}));
      });
      surface.addEventListener('pointerup', event => finish(event));
      surface.addEventListener('pointercancel', event => finish(event, true));
      surface.addEventListener('lostpointercapture', event => finish(event, true));
      // A press can be released outside the inline surface before capture begins.
      window.addEventListener('pointerup', event => {
        if (pointers.has(event.pointerId)) finish(event);
      });
      window.addEventListener('pointercancel', event => {
        if (pointers.has(event.pointerId)) finish(event, true);
      });
      surface.addEventListener('wheel', event => {
        const svg = getSvg();
        if (!svg || !finiteBox(viewBox(svg))) return;
        if (!viewer && !event.ctrlKey) return; // Ordinary article wheel scrolling stays native.
        event.preventDefault();
        const mouseWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
          (Math.abs(event.deltaY) >= 80 && Math.abs(event.deltaX) < 2 && Number.isInteger(event.deltaY));
        if (event.ctrlKey || !viewer || mouseWheel) {
          zoom(svg, Math.exp(event.deltaY * .0015), event.clientX, event.clientY);
        } else {
          const b = viewBox(svg);
          const inverse = screenInverse(svg);
          if (inverse) writeBox(svg, clampBox(svg, {...b,
            x:b.x + inverse.a*event.deltaX + inverse.c*event.deltaY,
            y:b.y + inverse.b*event.deltaX + inverse.d*event.deltaY}));
        }
      }, {passive:false});
      // Shortcuts also work while a zoom/reset button has keyboard focus.
      (viewer ? document : map).addEventListener('keydown', event => {
        if (viewer && !dialog.open) return;
        const svg = getSvg();
        if (!svg || !finiteBox(viewBox(svg))) return;
        const key = event.key;
        if (key === '+' || key === '=') zoom(svg, .8);
        else if (key === '-') zoom(svg, 1.25);
        else if (key === '0' || key.toLowerCase() === 'f') fit(svg);
        else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) {
          const b = viewBox(svg);
          const x = key === 'ArrowLeft' ? -.12 : key === 'ArrowRight' ? .12 : 0;
          const y = key === 'ArrowUp' ? -.12 : key === 'ArrowDown' ? .12 : 0;
          writeBox(svg, clampBox(svg, {...b, x:b.x+b.width*x, y:b.y+b.height*y}));
        } else return;
        event.preventDefault();
      });
    };
    attachGestures(stage, true);
    attachGestures(scroller, false);
    new ResizeObserver(() => { if (dialog.open) fit(getSvg()); }).observe(stage);
    new ResizeObserver(() => { if (!dialog.open && map.classList.contains('kt-map-enhanced')) fit(getSvg()); }).observe(scroller);
    if (map.dataset.mapId === 'journey') {
      const updateCompact = () => {
        scroller.tabIndex = compact.matches ? -1 : 0;
        scroller.setAttribute('aria-hidden', String(compact.matches));
      };
      compact.addEventListener('change', () => { updateCompact(); updateViewerLayout(); });
      updateCompact();
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dialog.open) { event.preventDefault(); closeViewer(); }
    });
    const ready = () => {
      const svg=scroller.querySelector('svg');
      if (!svg || svg.querySelector('.error-text') || !svg.querySelector('a')) return false;
      const box=graphBox(svg);
      if (!finiteBox(box)) return false;
      fit(svg);
      map.classList.add('kt-map-enhanced');
      return true;
    };
    if (!ready()) {
      const observer=new MutationObserver(() => {if (ready()) observer.disconnect();});
      observer.observe(scroller,{childList:true,subtree:true});
    }
  }
  const start=async () => {
    const maps=[...document.querySelectorAll('.kt-story-map')];
    if (!maps.length) return;
    // Local bundled Mermaid renders trusted generated projection source only.
    mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:'base',fontFamily:'system-ui, sans-serif'});
    const nodes=maps.map(map => map.querySelector('pre.mermaid'));
    const sources = nodes.map(node => node.textContent);
    nodes.forEach(node => { node.textContent=node.textContent; });
    try {
      await mermaid.run({nodes});
      for (const [index, map] of maps.entries()) {
        let portraitSvg = null;
        if (map.dataset.mapId === 'journey') {
          // The same nodes, edges and links; only Mermaid's layout direction changes.
          const source = sources[index].replace(/^flowchart LR$/m, 'flowchart TB')
            .replace(/"rankSpacing":\s*\d+/, '"rankSpacing": 16');
          const rendered = await mermaid.render(`kt-journey-portrait-${index}`, source);
          const holder = document.createElement('div');
          holder.innerHTML = rendered.svg;
          rendered.bindFunctions?.(holder);
          portraitSvg = holder.querySelector('svg');
        }
        init(map, portraitSvg);
      }
    }
    catch (error) { console.error('KT map rendering failed',error); }
  };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
