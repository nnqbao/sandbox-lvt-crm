import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { guideAnchorForMenu, guideEmbedUrl, guideFullUrl, menuLabel } from '../navigationRoutes.js';
import './pageHelp.css';

const FOCUSABLE = 'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
/** Sent by the embedded guide (docs/guide/guide.js) when Esc is pressed inside the iframe. */
const GUIDE_ESCAPE_MESSAGE = 'lvt-guide:escape';

/**
 * Round "?" next to the page title. Opens the guide topic for that menu
 * (GUIDE_ANCHORS in navigationRoutes.js) in a side panel: right drawer on
 * desktop, full-screen sheet on phones.
 */
export default function PageHelpButton({ menuId }) {
  const anchor = guideAnchorForMenu(menuId);
  const label = menuLabel(menuId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // Changing menu closes a panel that belongs to the previous page.
  useEffect(() => {
    setOpen(false);
  }, [menuId]);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  if (!anchor || !label) return null;
  const name = `Hướng dẫn: ${label}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="page-help-button"
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={name}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? <PageHelpPanel anchor={anchor} label={label} onClose={close} /> : null}
    </>
  );
}

function PageHelpPanel({ anchor, label, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    // The sheet is anchored at the left edge of the page; bring it into view.
    if (window.scrollX) window.scrollTo(0, window.scrollY);

    const focusables = () => [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Tabbing out of the iframe lands in the parent page; pull focus back in.
    const onFocusIn = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) closeRef.current?.focus();
    };
    const onMessage = (event) => {
      if (event.origin === window.location.origin && event.data?.type === GUIDE_ESCAPE_MESSAGE) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('message', onMessage);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="page-help-layer">
      <button type="button" className="page-help-backdrop" aria-label="Đóng hướng dẫn" tabIndex={-1} onClick={onClose} />
      <section ref={panelRef} className="page-help-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="page-help-head">
          <div>
            <p className="page-help-kicker">Hướng dẫn sử dụng</p>
            <h2 id={titleId}>{label}</h2>
          </div>
          <button ref={closeRef} type="button" className="page-help-close" onClick={onClose} aria-label="Đóng hướng dẫn" title="Đóng (Esc)">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="page-help-body">
          {!loaded ? <p className="page-help-loading" role="status">Đang tải hướng dẫn…</p> : null}
          <iframe
            className={loaded ? 'is-loaded' : ''}
            src={guideEmbedUrl(anchor)}
            title={`Hướng dẫn: ${label}`}
            allow="fullscreen"
            allowFullScreen
            onLoad={() => setLoaded(true)}
          />
        </div>
        <footer className="page-help-foot">
          <a href={guideFullUrl(anchor)} target="_blank" rel="noopener noreferrer">
            Mở toàn bộ hướng dẫn
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            <span className="sr-only"> (mở tab mới)</span>
          </a>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
