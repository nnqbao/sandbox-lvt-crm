// Minimal Chrome DevTools Protocol driver (no npm dependency).
// Launches the locally installed Google Chrome headless and talks to one page.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.GUIDE_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error('Không tìm thấy Google Chrome. Đặt biến GUIDE_CHROME=<đường dẫn Chrome>.');
  return found;
}

export async function launchChrome() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'lvt-guide-chrome-'));
  const child = spawn(findChrome(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--lang=vi-VN',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start in 20s')), 20000);
    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('exit', (code) => reject(new Error(`Chrome exited early (${code})`)));
  });

  const browser = await Connection.open(wsUrl);
  return {
    browser,
    async newPage() {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      return new Page(browser, sessionId);
    },
    async close() {
      try {
        await browser.send('Browser.close');
      } catch {
        /* already gone */
      }
      browser.close();
      child.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        /* temp profile; the OS cleans it up later */
      }
    },
  };
}

class Connection {
  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Connection(ws)));
      ws.addEventListener('error', (event) => reject(event.error || new Error('CDP websocket error')));
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} ${message.error.data || ''}`.trim()));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.ws.close();
  }
}

export class Page {
  constructor(connection, sessionId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.consoleMessages = [];
    this.initScriptId = null;
    connection.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Page.javascriptDialogOpening') {
        // e.g. "unsaved changes" beforeunload prompts between shots
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      } else if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
        this.consoleMessages.push(`${message.params.type}: ${text}`);
      } else if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        this.consoleMessages.push(`exception: ${details.exception?.description || details.text}`);
      }
    });
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Ho_Chi_Minh' });
    await this.send('Emulation.setLocaleOverride', { locale: 'vi-VN' }).catch(() => {});
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile }).catch(() => {});
  }

  async setInitScript(source) {
    if (this.initScriptId) {
      await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.initScriptId });
    }
    const { identifier } = await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    this.initScriptId = identifier;
  }

  async goto(url, timeout = 20000) {
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`load timeout: ${url}`));
      }, timeout);
      const off = this.connection.on((message) => {
        if (message.sessionId === this.sessionId && message.method === 'Page.loadEventFired') {
          clearTimeout(timer);
          off();
          resolve();
        }
      });
    });
    loaded.catch(() => {});
    this.consoleMessages = [];
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /** Evaluate an expression (string) and return its JSON value; awaits promises. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description);
    }
    return result.result.value;
  }

  async screenshot({ format = 'webp', quality = 80, clip } = {}) {
    const params = { format, captureBeyondViewport: true };
    if (format !== 'png') params.quality = quality;
    if (clip) params.clip = { ...clip, scale: 1 };
    const { data } = await this.send('Page.captureScreenshot', params);
    return Buffer.from(data, 'base64');
  }
}
