// Bridge to the Android / iOS app shell that shows this web app in a WebView.
//
// The shell injects `window.LvtApp` (Android, WebViewCompat.addWebMessageListener, only for this
// origin) or `window.webkit.messageHandlers.lvtApp` (iOS). Outside the app neither exists and
// every function here is a no-op, so browsers behave exactly as before.
//
// Web → app: { type: 'ready' | 'signed-out' | 'quick-sign-in' } · { type: 'handoff-request', id }
//            { type: 'file', mode: 'open' | 'save', name, mime, data (base64) }
// App → web: { type: 'handoff', id, code } | { type: 'handoff-failed', id }
//            { type: 'open-notification', item: { key, kind, sourceType, sourceId, menu } }
//            { type: 'sign-out' }
// Sign-in stays native (password, vân tay / Face ID, passkey): the app hands the WebView a
// single-use code (convex/appHandoff.ts), never a token and never in a URL.

/** @type {any} */
const appWindow = typeof window !== 'undefined' ? window : {};
const listeners = new Set();
let explicitSignOut = false;
let nextRequestId = 1;

function androidBridge() {
  return appWindow.LvtApp && typeof appWindow.LvtApp.postMessage === 'function' ? appWindow.LvtApp : null;
}

function iosBridge() {
  const handler = appWindow.webkit?.messageHandlers?.lvtApp;
  return handler && typeof handler.postMessage === 'function' ? handler : null;
}

export function isInApp() {
  return Boolean(androidBridge() || iosBridge());
}

export function postToApp(message) {
  const text = JSON.stringify(message);
  const android = androidBridge();
  if (android) {
    android.postMessage(text);
    return true;
  }
  const ios = iosBridge();
  if (ios) {
    ios.postMessage(text);
    return true;
  }
  return false;
}

/** A message from the app (Android `LvtApp.onmessage`, iOS `window.__lvtAppDeliver`). */
export function receiveAppMessage(raw) {
  let message = raw;
  if (typeof raw === 'string') {
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
  }
  if (!message || typeof message.type !== 'string') return;
  for (const listener of [...listeners]) listener(message);
}

/** Subscribe to messages from the app; returns the unsubscribe function. */
export function onAppMessage(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the app for a sign-in code; resolves to the code, or null when the app has no session. */
export function requestAppHandoff(timeoutMs = 20_000) {
  const id = nextRequestId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const stop = onAppMessage((message) => {
      if (message.id !== id) return;
      if (message.type === 'handoff') finish(typeof message.code === 'string' ? message.code : null);
      else if (message.type === 'handoff-failed') finish(null);
    });
    function finish(code) {
      window.clearTimeout(timer);
      stop();
      resolve(code);
    }
    if (!postToApp({ type: 'handoff-request', id })) finish(null);
  });
}

/** The user chose "Đăng xuất": once signed out, the app returns to its own sign-in screen. */
export function markAppSignOut() {
  explicitSignOut = true;
}

export function appSignOutRequested() {
  return explicitSignOut;
}

/** Give a file to the app: 'open' shows it in a viewer, 'save' keeps it in Downloads and opens it. */
export function sendBlobToApp(blob, name, mode = 'save') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const data = result.slice(result.indexOf(',') + 1);
      resolve(postToApp({ type: 'file', mode, name: name || 'tai-lieu', mime: blob.type || '', data }));
    };
    reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

function sendAnchorToApp(anchor) {
  const href = anchor.href || '';
  if (!anchor.hasAttribute('download') || !/^(blob:|data:)/.test(href)) return false;
  const name = anchor.getAttribute('download') || 'tai-lieu';
  void fetch(href)
    .then((response) => response.blob())
    .then((blob) => sendBlobToApp(blob, name, 'save'))
    .catch((error) => {
      console.error('App download failed', error);
      window.alert('Không lưu được tệp. Vui lòng thử lại.');
    });
  return true;
}

let installed = false;

/**
 * In the app: receive app messages, and hand `<a download href="blob:…">` downloads (work files,
 * Excel exports, PDFs) to the app, since a WebView cannot save blob URLs itself.
 */
export function installAppBridge() {
  if (installed || !isInApp()) return;
  installed = true;
  appWindow.__lvtAppDeliver = receiveAppMessage;
  const android = androidBridge();
  if (android) android.onmessage = (event) => receiveAppMessage(event.data);
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    if (sendAnchorToApp(this)) return undefined;
    return originalClick.call(this);
  };
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
      if (anchor && sendAnchorToApp(anchor)) event.preventDefault();
    },
    true,
  );
  document.documentElement.classList.add('in-app');
}
