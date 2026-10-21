// In-page helpers driven by run.mjs through CDP Runtime.evaluate.
//
// Target spec (used by actions, callouts and clips):
//   'css selector'                         first visible match
//   { css, text, exact, nth, within }      text = visible text contains (or equals when exact);
//                                          the most specific (shortest text) matches win.

const CALLOUT_COLOR = '#c0472f'; // --lvt-coral-strong: white text reaches 5:1

// Case-insensitive: CSS text-transform changes innerText.
function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function resolveTarget(spec, { all = false } = {}) {
  if (!spec) return all ? [] : null;
  const desc = typeof spec === 'string' ? { css: spec } : spec;
  const scope = desc.within ? resolveTarget(desc.within) : document;
  if (!scope) return all ? [] : null;
  let found = [...scope.querySelectorAll(desc.css || '*')].filter((el) => desc.hidden || isVisible(el));
  if (desc.text != null) {
    const wanted = normalize(desc.text);
    found = found
      .map((el) => ({ el, text: normalize(el.innerText ?? el.textContent) }))
      .filter(({ text }) => (desc.exact ? text === wanted : text.includes(wanted)))
      .sort((a, b) => a.text.length - b.text.length)
      .map(({ el }) => el);
    // Keep document order among equally specific matches for stable nth.
    if (found.length) {
      const best = normalize(found[0].innerText ?? found[0].textContent).length;
      const top = found.filter((el) => normalize(el.innerText ?? el.textContent).length === best);
      const rest = found.filter((el) => !top.includes(el));
      top.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      found = [...top, ...rest];
    }
  }
  if (all) return found;
  return found[desc.nth || 0] || null;
}

function describe(spec) {
  return typeof spec === 'string' ? spec : JSON.stringify(spec);
}

function mustResolve(spec) {
  const el = resolveTarget(spec);
  if (!el) throw new Error(`guide: target not found: ${describe(spec)}`);
  return el;
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function waitFor(spec, timeout = 6000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const el = resolveTarget(spec);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`guide: timed out waiting for ${describe(spec)}`);
}

export async function act(action) {
  if (action.click) {
    const el = mustResolve(action.click);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.click();
  } else if (action.fill) {
    const el = mustResolve(action.fill);
    el.focus();
    setNativeValue(el, action.value ?? '');
    if (!action.keepFocus) el.blur();
  } else if (action.select) {
    setNativeValue(mustResolve(action.select), action.value);
  } else if (action.check) {
    const el = mustResolve(action.check);
    const want = action.value !== false;
    if (el.checked !== want) el.click();
  } else if (action.scrollTo) {
    mustResolve(action.scrollTo).scrollIntoView({ block: action.block || 'start' });
    if (action.offset) window.scrollBy(0, action.offset);
  } else if (action.scrollBy != null) {
    window.scrollBy(0, action.scrollBy);
  } else if (action.scrollInside) {
    const el = mustResolve(action.scrollInside);
    el.scrollTop = action.top ?? el.scrollTop;
    el.scrollLeft = action.left ?? el.scrollLeft;
  } else if (action.key) {
    const target = action.target ? mustResolve(action.target) : document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true }));
  } else if (action.waitFor) {
    await waitFor(action.waitFor, action.timeout);
  } else if (action.upload) {
    const input = mustResolve({ ...(typeof action.upload === 'string' ? { css: action.upload } : action.upload), hidden: true });
    const transfer = new DataTransfer();
    for (const file of action.files || []) {
      const bytes = file.base64 != null ? base64ToBytes(file.base64) : new TextEncoder().encode(file.text || '');
      transfer.items.add(new File([bytes], file.name, { type: file.type || 'application/octet-stream' }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (action.focus) {
    mustResolve(action.focus).focus();
  } else if (action.remove) {
    for (const el of resolveTarget(action.remove, { all: true })) el.remove();
  } else if (action.style) {
    for (const el of resolveTarget(action.style, { all: true })) Object.assign(el.style, action.css || {});
  } else if (action.text) {
    // Replace text in a node (e.g. a date label) for a cleaner illustration.
    const el = mustResolve(action.text);
    el.textContent = action.value;
  }
}

function overlayRoot() {
  let root = document.getElementById('guide-overlay');
  if (!root) {
    root = document.createElement('div');
    root.id = 'guide-overlay';
    Object.assign(root.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });
    document.body.appendChild(root);
  }
  return root;
}

function docRect(el, pad = 0) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + window.scrollX - pad,
    y: r.top + window.scrollY - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

/**
 * Draw numbered callouts. Each item: { n, target, pos = 'tl', box = true, pad = 4, dx, dy }.
 * pos: tl | tr | bl | br (badge on that corner) or left | right | top | bottom (outside, centred).
 * Returns the document rectangles covered (box + badge) so clips can include them.
 */
export function callouts(list = []) {
  const root = overlayRoot();
  root.replaceChildren();
  const covered = [];
  const size = 30;
  const maxX = document.documentElement.scrollWidth;
  for (const item of list) {
    const el = mustResolve(item.target);
    const pad = item.pad ?? 4;
    const rect = docRect(el, pad);
    if (item.box !== false) {
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'absolute',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: `3px solid ${CALLOUT_COLOR}`,
        borderRadius: '10px',
        boxSizing: 'border-box',
        boxShadow: '0 0 0 3px rgba(255,255,255,.85), 0 6px 18px rgba(20,53,95,.18)',
      });
      root.appendChild(box);
    }
    const pos = item.pos || 'tl';
    const half = size / 2;
    const centers = {
      tl: [rect.x, rect.y],
      tr: [rect.x + rect.width, rect.y],
      bl: [rect.x, rect.y + rect.height],
      br: [rect.x + rect.width, rect.y + rect.height],
      left: [rect.x - half - 6, rect.y + rect.height / 2],
      right: [rect.x + rect.width + half + 6, rect.y + rect.height / 2],
      top: [rect.x + rect.width / 2, rect.y - half - 6],
      bottom: [rect.x + rect.width / 2, rect.y + rect.height + half + 6],
    };
    let [cx, cy] = centers[pos] || centers.tl;
    cx += item.dx || 0;
    cy += item.dy || 0;
    cx = Math.min(Math.max(cx, half + 2), maxX - half - 2);
    cy = Math.max(cy, half + 2);
    const badge = document.createElement('div');
    badge.textContent = String(item.n);
    badge.setAttribute('aria-hidden', 'true');
    Object.assign(badge.style, {
      position: 'absolute',
      left: `${cx - half}px`,
      top: `${cy - half}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: CALLOUT_COLOR,
      color: '#fff',
      font: "800 16px/30px 'Montserrat Variable', ui-sans-serif, system-ui, sans-serif",
      textAlign: 'center',
      border: '2px solid #fff',
      boxSizing: 'content-box',
      boxShadow: '0 4px 12px rgba(20,53,95,.35)',
    });
    root.appendChild(badge);
    covered.push(rect, { x: cx - half - 2, y: cy - half - 2, width: size + 4, height: size + 4 });
  }
  return covered;
}

/** Union of a target's rectangle (plus pad) and the callout rectangles, in document coords. */
export function clipRect(spec, covered = []) {
  const desc = typeof spec === 'string' || spec?.css || spec?.text ? { target: spec } : spec;
  const el = mustResolve(desc.target);
  const pad = desc.pad ?? 12;
  const rects = [docRect(el, pad), ...(desc.includeCallouts === false ? [] : covered)];
  const x1 = Math.max(0, Math.min(...rects.map((r) => r.x)));
  const y1 = Math.max(0, Math.min(...rects.map((r) => r.y)));
  const x2 = Math.min(document.documentElement.scrollWidth, Math.max(...rects.map((r) => r.x + r.width)));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: Math.floor(x1), y: Math.floor(y1), width: Math.ceil(x2 - x1), height: Math.ceil(y2 - y1) };
}

export function installGuideHelpers() {
  window.__guide = {
    resolve: resolveTarget,
    act,
    callouts,
    clipRect,
    missing: () => [...(window.__GUIDE_MISSING__ || [])],
  };
}
