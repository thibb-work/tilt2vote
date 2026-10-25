/** Real production pages and Firebase connections; no mocked network traffic.
 * Sensor events and their permission grant are simulated on desktop.
 * HOST_PASSCODE_FILE contains only the host passcode; never logs credentials.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'https://tilt2vote.vercel.app';
const USERS = 60;
const SOAK_SECONDS = Number(process.env.SOAK_SECONDS ?? 60);
const passcode = process.env.HOST_PASSCODE_FILE
  ? fs.readFileSync(process.env.HOST_PASSCODE_FILE, 'utf8').trim()
  : process.env.HOST_PASSCODE;
assert.ok(passcode, 'Set HOST_PASSCODE or HOST_PASSCODE_FILE');
const output = process.env.TEST_OUTPUT ?? 'output/playwright/production-60';
fs.mkdirSync(output, { recursive: true });
const report = { base: BASE, users: USERS, started: new Date().toISOString(), checks: [], pageErrors: [], httpErrors: [] };
const browsers = [];
const phones = [];
const identities = [];
const networkStates = new Map();
let host;
let lockedByTest = false;
let phoneWrites = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(label, fn, timeout = 30000) {
  const start = Date.now();
  while (!(await fn())) {
    assert.ok(Date.now() - start < timeout, `Timed out: ${label}`);
    await sleep(250);
  }
  const ms = Date.now() - start;
  report.checks.push({ label, ms });
  console.log(`PASS ${label} (${ms}ms)`);
  return ms;
}
function observe(page) {
  const network = { socketsOpened: 0, socketsClosed: 0, phoneWrites: 0, rejectedWrites: 0 };
  networkStates.set(page, network);
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('websocket', (socket) => {
    network.socketsOpened++;
    socket.on('close', () => network.socketsClosed++);
    socket.on('framereceived', ({ payload }) => {
      try { if (JSON.parse(String(payload)).d?.b?.s === 'permission_denied') network.rejectedWrites++; } catch {}
    });
    socket.on('framesent', ({ payload }) => {
    try {
      const message = JSON.parse(String(payload));
      if (message.d?.a === 'p' && message.d?.b?.p?.includes('/phones/')) { phoneWrites++; network.phoneWrites++; }
    } catch { /* Firebase may split a frame; capacity assertions use the UI. */ }
    });
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400) report.httpErrors.push({ status: response.status(), host: url.host, path: url.pathname });
    if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('accounts:signUp') && response.ok()) {
      const data = await response.json().catch(() => null);
      if (data?.idToken) identities.push({ token: data.idToken, key: url.searchParams.get('key'), uid: data.localId });
    }
  });
}
const gyro = () => {
  window.__networkTransitions = [];
  for (const type of ['online', 'offline']) window.addEventListener(type, () => {
    window.__networkTransitions.push({ type, online: navigator.onLine, at: Date.now() });
  });
  // Desktop Chromium has no sensor to grant. Model an approving handset.
  window.DeviceOrientationEvent = class extends Event {
    static async requestPermission() { return 'granted'; }
  };
  window.__pose = { beta: 0, gamma: 0 };
  window.__moving = false;
  window.__wedge = null;
  window.__aim = (wedge, jitter = 0) => {
    window.__wedge = wedge;
    if (wedge === null) { window.__pose = { beta: 0, gamma: 0 }; return; }
    const angle = (wedge * 60 + jitter) * Math.PI / 180;
    window.__pose = { beta: -38 * Math.cos(angle), gamma: 38 * Math.sin(angle) };
  };
  const tick = () => {
    if (window.__moving && window.__wedge !== null) {
      const angle = (window.__wedge * 60 + Math.sin(performance.now() / 500) * 10) * Math.PI / 180;
      window.__pose = { beta: -38 * Math.cos(angle), gamma: 38 * Math.sin(angle) };
    }
    const event = new Event('deviceorientation');
    for (const [key, value] of Object.entries({ ...window.__pose, alpha: 0 })) {
      Object.defineProperty(event, key, { value });
    }
    window.dispatchEvent(event);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const counts = (page) => page.locator('.sector-count').allTextContents().then((v) => v.map(Number));
const total = (page) => page.locator('.hub-label').textContent().then(Number);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const aimAll = (wedge) => Promise.all(phones.map(({ page }) => page.evaluate((w) => window.__aim(w), wedge)));
async function allTallies(expected, n = USERS) {
  const results = await Promise.all([host, ...phones.map((p) => p.page)].map(async (p) => same(await counts(p), expected) && await total(p) === n));
  return results.every(Boolean);
}
try {
  for (let i = 0; i < 3; i++) browsers.push(await chromium.launch({ args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }));
  const hostContext = await browsers[0].newContext({ viewport: { width: 1440, height: 1000 } });
  host = await hostContext.newPage();
  observe(host);
  await host.goto(`${BASE}/host`, { waitUntil: 'networkidle' });
  await host.getByRole('textbox', { name: 'Passcode' }).fill(passcode);
  await host.getByRole('button', { name: 'Unlock', exact: true }).click();
  await host.locator('img.qr').waitFor({ timeout: 30000 });
  assert.equal(await host.getByRole('button', { name: 'Reopen round', exact: true }).count(), 0, 'Production round is already frozen; leave it unchanged');
  const png = PNG.sync.read(Buffer.from((await host.locator('img.qr').getAttribute('src')).split(',')[1], 'base64'));
  const link = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  assert.ok(link, 'QR decodes');
  assert.equal(new URL(link).origin, BASE, 'QR uses new production origin');
  await until('host connected with a QR for the new domain', async () => (await host.locator('.status-line').textContent()).includes('Waiting for the first phone'));
  for (let batch = 0; batch < USERS; batch += 6) {
    await Promise.all(Array.from({ length: 6 }, async (_, j) => {
      const i = batch + j;
      const context = await browsers[i % browsers.length].newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(gyro);
      const page = await context.newPage();
      phones.push({ context, page, i });
      observe(page);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Activate gyroscope', exact: true }).click();
      await page.locator('.status-line').waitFor();
    }));
    console.log(`Joined ${batch + 6}/${USERS}`);
  }
  await until('host and all 60 voters finish signing in with independent Firebase identities', async () => new Set(identities.map((v) => v.uid)).size === USERS + 1);
  await until('all 60 phones present, flat, and receiving the tally', () => allTallies([0, 0, 0, 0, 0, 0]));
  await until('host renders 60 individual dots', async () => await host.locator('.dot-phone').count() === USERS);
  for (let wedge = 0; wedge < 6; wedge++) {
    await aimAll(wedge);
    const expected = Array.from({ length: 6 }, (_, w) => w === wedge ? USERS : 0);
    await until(`all 60 votes move to wedge ${wedge + 1} on host and every phone`, () => allTallies(expected));
  }
  await Promise.all(phones.map(({ page, i }) => page.evaluate((w) => window.__aim(w), i % 6)));
  await until('votes split equally across all six options', () => allTallies([10, 10, 10, 10, 10, 10]));
  await Promise.all(phones.map(({ page }) => page.evaluate(() => { window.__moving = true; })));
  const writesBefore = phoneWrites;
  const soakStart = Date.now();
  let samples = 0;
  while (Date.now() - soakStart < SOAK_SECONDS * 1000) {
    // Sensor events move continuously within each wedge at animation-frame rate.
    await sleep(1000);
    assert.equal(await total(host), USERS, 'No voters lost during movement');
    assert.ok(same(await counts(host), [10, 10, 10, 10, 10, 10]), 'Correct counts during movement');
    const states = await Promise.all(phones.map(({ page }) => page.locator('.status-line').textContent()));
    assert.ok(states.every((s) => s.startsWith('Aiming at ')), 'Every voter remains healthy during movement');
    samples++;
    if (samples % 10 === 0) console.log(`Streaming: ${Math.round((Date.now() - soakStart) / 1000)}s, 60/60 healthy`);
  }
  report.checks.push({ label: 'all 60 continuously moving voters remain counted and healthy', ms: Date.now() - soakStart, samples });
  report.streamingPhoneWrites = phoneWrites - writesBefore;
  report.streamingWritesPerSecond = report.streamingPhoneWrites / ((Date.now() - soakStart) / 1000);
  await Promise.all(phones.map(({ page }) => page.evaluate(() => { window.__moving = false; })));
  await host.screenshot({ path: `${output}/host-60.png`, fullPage: true });
  await phones[0].page.screenshot({ path: `${output}/voter-60.png`, fullPage: true });
  await host.getByRole('button', { name: 'Lock votes', exact: true }).click();
  lockedByTest = true;
  await until('locking reaches all 60 phones', async () => (await Promise.all(phones.map(({ page }) => page.locator('.status-line').textContent()))).every((s) => s === 'Round closed'));
  await aimAll(0);
  await sleep(1500);
  assert.ok(await allTallies([10, 10, 10, 10, 10, 10]), 'Frozen results stay unchanged when sensors move');
  await host.getByRole('button', { name: 'Reopen round', exact: true }).click();
  await until('reopening restores all 60 live votes', () => allTallies([60, 0, 0, 0, 0, 0]));
  lockedByTest = false;
  await aimAll(null);
  await until('abstention clears votes while retaining 60 participants', () => allTallies([0, 0, 0, 0, 0, 0]));
  await Promise.all(phones.slice(0, 6).map(({ context }) => context.setOffline(true)));
  await until('six disconnected phones leave the host count', async () => await total(host) === 54, 45000);
  await until('all six phones observe the outage', async () => (await Promise.all(phones.slice(0, 6).map(({ page }) => page.evaluate(() => !navigator.onLine && document.querySelector('.status-line')?.textContent === 'Reconnecting')))).every(Boolean));
  await sleep(2000);
  await Promise.all(phones.slice(0, 6).map(({ context }) => context.setOffline(false)));
  await until('six reconnecting phones restore the full room', () => allTallies([0, 0, 0, 0, 0, 0]), 45000);
  assert.deepEqual(report.pageErrors, [], 'No JavaScript errors');
  report.recoveredAuthResponses = report.httpErrors.filter((e) => e.host === 'identitytoolkit.googleapis.com' && e.path.endsWith('accounts:signUp') && [400, 429].includes(e.status));
  assert.deepEqual(report.httpErrors.filter((e) => !report.recoveredAuthResponses.includes(e)), [], 'No other failed HTTP responses');
  await Promise.all(phones.map(({ page }) => page.goto('about:blank')));
  await until('test voters cleanly leave the room', async () => await total(host) === 0, 45000);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.message.replaceAll(passcode, '[REDACTED]');
  console.error(report.failure);
  if (host) await host.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  report.diagnostics = await Promise.all([host, ...phones.map((p) => p.page)].filter(Boolean).map(async (page) => ({
    network: networkStates.get(page),
    state: await page.evaluate(() => ({
      online: navigator.onLine,
      visibility: document.visibilityState,
      networkTransitions: window.__networkTransitions,
      status: document.querySelector('.status-line')?.textContent,
      warning: document.querySelector('.warn')?.textContent,
      total: document.querySelector('.hub-label')?.textContent,
    })).catch(() => null),
  })));
  if (phones.length) await phones[0].page.screenshot({ path: `${output}/failure-voter.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (lockedByTest && host) await host.getByRole('button', { name: 'Reopen round', exact: true }).click().catch(() => {});
  await Promise.all(browsers.map((browser) => browser.close()));
  // Delete only anonymous accounts created by this harness.
  report.identitiesRemoved = 0;
  for (const identity of identities) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${identity.key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: identity.token }),
    }).catch(() => null);
    if (res?.ok) report.identitiesRemoved++;
  }
  report.finished = new Date().toISOString();
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Report: ${output}/report.json`);
}
