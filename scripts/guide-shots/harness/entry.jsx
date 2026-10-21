// Harness entry: freeze the clock, install page helpers, then boot the real app.
// window.__GUIDE__ ({ scenario, state, overrides, now }) is injected by run.mjs
// before any script runs. Static imports are avoided on purpose so the Date shim
// is in place before app modules evaluate.
import { installGuideHelpers } from './pageHelpers.js';

const guide = (window.__GUIDE__ = window.__GUIDE__ || {});
const RealDate = Date;
const fixedStart = RealDate.parse(guide.now || '2026-10-21T09:00:00+07:00');
const realStart = RealDate.now();
const fakeNow = () => fixedStart + (RealDate.now() - realStart);

class GuideDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow());
    else super(...args);
  }

  static now() {
    return fakeNow();
  }
}
window.Date = GuideDate;

installGuideHelpers();

// Keep screenshots deterministic: no smooth scrolling or long transitions.
const style = document.createElement('style');
style.textContent = `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;
document.head.appendChild(style);

import('/src/main.jsx');
