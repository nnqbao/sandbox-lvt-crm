// In-page overlay for guide videos: cursor, click ripple, highlight boxes, caption bar,
// title cards and a stand-in for native <select> popups (headless Chrome never paints them).
// Installed by run.mjs through Runtime.evaluate as `window.__video`; relies on window.__guide.
export function installVideoOverlay() {
  if (window.__video) return;
  const NAVY = '#14355f';
  const CORAL = '#c0472f';
  const FONT = "'Montserrat Variable', ui-sans-serif, system-ui, sans-serif";
  const CAPTION_SPACE = 172; // keep targets clear of the caption bar

  const fixed = document.createElement('div');
  fixed.id = 'video-fixed';
  Object.assign(fixed.style, { position: 'fixed', inset: '0', zIndex: '2147483646', pointerEvents: 'none' });
  const marks = document.createElement('div');
  marks.id = 'video-marks';
  Object.assign(marks.style, { position: 'absolute', left: '0', top: '0', width: '0', height: '0', zIndex: '2147483645', pointerEvents: 'none' });

  const caption = document.createElement('div');
  Object.assign(caption.style, {
    position: 'absolute', left: '50%', bottom: '62px', transform: 'translateX(-50%)',
    width: 'min(1120px, calc(100% - 64px))', boxSizing: 'border-box', padding: '16px 24px',
    borderRadius: '16px', background: 'rgba(20,53,95,.94)', color: '#fff',
    font: `600 24px/1.4 ${FONT}`, boxShadow: '0 10px 30px rgba(20,53,95,.35)',
    display: 'none', alignItems: 'center', gap: '16px',
  });
  const captionStep = document.createElement('span');
  Object.assign(captionStep.style, {
    flex: '0 0 auto', padding: '6px 14px', borderRadius: '999px', background: CORAL,
    font: `800 18px/1.2 ${FONT}`, letterSpacing: '.02em', whiteSpace: 'nowrap',
  });
  const captionText = document.createElement('span');
  caption.append(captionStep, captionText);

  const cursor = document.createElement('div');
  cursor.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.4.9 3.9 7.4-2.9 1.5-3.9-7.5L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: 'absolute', left: '0', top: '0', width: '34px', height: '34px', display: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' });
  const ripple = document.createElement('div');
  Object.assign(ripple.style, { position: 'absolute', borderRadius: '50%', border: `4px solid ${CORAL}`, background: 'rgba(192,71,47,.18)', display: 'none', boxSizing: 'border-box' });

  const card = document.createElement('div');
  Object.assign(card.style, {
    position: 'absolute', inset: '0', display: 'none', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', textAlign: 'center', gap: '18px', padding: '0 120px',
    background: `linear-gradient(135deg, ${NAVY} 0%, #1f4f8a 100%)`, color: '#fff', font: `500 26px/1.5 ${FONT}`,
  });
  const cardKicker = document.createElement('div');
  Object.assign(cardKicker.style, { font: `700 20px/1.3 ${FONT}`, letterSpacing: '.12em', textTransform: 'uppercase', opacity: '.8' });
  const cardTitle = document.createElement('div');
  Object.assign(cardTitle.style, { font: `800 52px/1.2 ${FONT}` });
  const cardText = document.createElement('div');
  Object.assign(cardText.style, { maxWidth: '980px', opacity: '.92' });
  card.append(cardKicker, cardTitle, cardText);

  const dropdown = document.createElement('div');
  Object.assign(dropdown.style, {
    position: 'absolute', display: 'none', background: '#fff', border: '1px solid #c7d2e0', borderRadius: '8px',
    boxShadow: '0 12px 28px rgba(20,53,95,.25)', padding: '4px 0', font: `500 15px/1.3 ${FONT}`, color: '#14233a',
    maxHeight: '360px', overflow: 'hidden', minWidth: '180px',
  });

  fixed.append(card, dropdown, caption, ripple, cursor);
  document.body.append(marks, fixed);

  const el = (spec) => {
    const found = window.__guide.resolve(spec);
    if (!found) throw new Error(`video: target not found: ${typeof spec === 'string' ? spec : JSON.stringify(spec)}`);
    return found;
  };
  let pos = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.55 };
  let scroller = null;

  window.__video = {
    caption(step, text) {
      if (!text) {
        caption.style.display = 'none';
        return;
      }
      captionStep.textContent = step || '';
      captionStep.style.display = step ? '' : 'none';
      captionText.textContent = text;
      caption.style.display = 'flex';
    },
    /** Move the caption to the top while the target sits behind it (e.g. a sticky save bar). */
    placeCaption(spec) {
      let top = false;
      if (spec) {
        const r = el(spec).getBoundingClientRect();
        top = r.bottom > window.innerHeight - CAPTION_SPACE;
      }
      Object.assign(caption.style, top ? { top: '22px', bottom: 'auto' } : { top: 'auto', bottom: '62px' });
    },
    card(kicker, title, text) {
      if (!title) {
        card.style.display = 'none';
        return;
      }
      cardKicker.textContent = kicker || '';
      cardTitle.textContent = title;
      cardText.textContent = text || '';
      card.style.display = 'flex';
    },
    cursorShow(show = true) {
      cursor.style.display = show ? 'block' : 'none';
      cursor.style.transform = `translate(${pos.x - 4}px, ${pos.y - 2}px)`;
    },
    cursorAt() {
      return pos;
    },
    cursorTo(x, y) {
      pos = { x, y };
      cursor.style.display = 'block';
      cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
    },
    ripple(size) {
      if (!size) {
        ripple.style.display = 'none';
        return;
      }
      Object.assign(ripple.style, { display: 'block', width: `${size}px`, height: `${size}px`, left: `${pos.x - size / 2}px`, top: `${pos.y - size / 2}px` });
    },
    /**
     * Viewport point to aim at, plus how far its scroll container (a scrollable ancestor such as
     * the sidebar or a modal body, else the window) must scroll so the target sits clear of the
     * caption bar. scrollStep() then scrolls that same container.
     */
    aim(spec, anchor = 'center') {
      const target = el(spec);
      const r = target.getBoundingClientRect();
      scroller = null;
      for (let p = target.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight + 2) {
          scroller = p;
          break;
        }
      }
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const top = Math.max(box.top + 12, scroller ? 0 : 84);
      const bottom = Math.min(box.bottom - 12, window.innerHeight - CAPTION_SPACE);
      let scroll = 0;
      if (r.top < top || r.bottom > bottom) {
        const free = bottom - top;
        scroll = r.height > free ? r.top - top : r.top - (top + (free - r.height) / 2);
      }
      const x = anchor === 'left' ? r.left + Math.min(24, r.width / 2) : r.left + r.width / 2;
      const y = r.top + r.height / 2 - scroll;
      return { x: Math.round(x), y: Math.round(y), scroll: Math.round(scroll) };
    },
    scrollStep(dy) {
      (scroller || window).scrollBy(0, dy);
    },
    useWindow() {
      scroller = null;
      return Math.round(window.scrollY);
    },
    highlight(spec, label, pad = 6) {
      const target = el(spec);
      const r = target.getBoundingClientRect();
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'absolute', left: `${r.left + window.scrollX - pad}px`, top: `${r.top + window.scrollY - pad}px`,
        width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, border: `4px solid ${CORAL}`,
        borderRadius: '12px', boxSizing: 'border-box', boxShadow: '0 0 0 4px rgba(255,255,255,.85), 0 8px 22px rgba(20,53,95,.22)',
      });
      marks.appendChild(box);
      if (label) {
        const tag = document.createElement('div');
        tag.textContent = label;
        const above = r.top > 70;
        Object.assign(tag.style, {
          position: 'absolute', left: `${Math.max(8, r.left + window.scrollX - pad)}px`,
          top: above ? `${r.top + window.scrollY - pad - 40}px` : `${r.bottom + window.scrollY + pad + 6}px`,
          padding: '6px 12px', borderRadius: '8px', background: CORAL, color: '#fff',
          font: `700 17px/1.2 ${FONT}`, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(20,53,95,.3)',
        });
        marks.appendChild(tag);
      }
    },
    clearHighlights() {
      marks.replaceChildren();
    },
    /** Paint a fake popup for a native <select>; returns the option index that matches `wanted`. */
    showDropdown(spec, wanted) {
      const select = el(spec);
      const r = select.getBoundingClientRect();
      const options = [...select.options];
      const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
      let index = options.findIndex((o) => o.value === wanted);
      if (index < 0) index = options.findIndex((o) => norm(o.textContent).startsWith(norm(wanted)));
      if (index < 0) throw new Error(`video: option not found: ${wanted}`);
      dropdown.replaceChildren(...options.slice(0, 12).map((option, i) => {
        const row = document.createElement('div');
        row.textContent = option.textContent;
        Object.assign(row.style, { padding: '7px 14px', whiteSpace: 'nowrap', color: option.disabled ? '#9aa6b5' : '' });
        row.dataset.index = String(i);
        return row;
      }));
      Object.assign(dropdown.style, { display: 'block', left: `${r.left}px`, top: `${r.bottom + 4}px`, minWidth: `${Math.max(180, r.width)}px` });
      return index;
    },
    hoverDropdown(index) {
      for (const row of dropdown.children) {
        const on = Number(row.dataset.index) === index;
        row.style.background = on ? '#1f6feb' : '';
        row.style.color = on ? '#fff' : '';
      }
      const row = dropdown.children[index];
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2) };
    },
    hideDropdown() {
      dropdown.style.display = 'none';
    },
    selectIndex(spec, index) {
      const select = el(spec);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, select.options[index].value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    typeValue(spec, value) {
      const input = el(spec);
      input.focus();
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    blur() {
      document.activeElement?.blur?.();
    },
  };
}
