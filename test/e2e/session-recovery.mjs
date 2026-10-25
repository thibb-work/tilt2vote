/** Regression: a refused first sign-in must not permanently lose round updates. */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'https://tilt2vote.vercel.app';
assert.ok(process.env.HOST_PASSCODE, 'Load HOST_PASSCODE from .env.local');
const browser = await chromium.launch();
const identities = [];
let host;
let lockedByTest = false;
function observe(page) {
  page.on('response', async (r) => {
    const url = new URL(r.url());
    if (url.pathname.endsWith('accounts:signUp') && r.ok()) {
      const data = await r.json().catch(() => null);
      if (data?.idToken) identities.push({ token: data.idToken, key: url.searchParams.get('key') });
    }
  });
}
try {
  const hc = await browser.newContext();
  await hc.addInitScript(() => localStorage.setItem('firebase:previous_websocket_failure', 'true'));
  host = await hc.newPage(); observe(host);
  await host.goto(`${BASE}/host`);
  await host.locator('input.field').fill(process.env.HOST_PASSCODE);
  await host.locator('button[type=submit]').click();
  await host.locator('img.qr').waitFor();
  assert.equal(await host.getByRole('button', { name: 'Reopen round', exact: true }).count(), 0, 'Leave an already locked round unchanged');
  const png = PNG.sync.read(Buffer.from((await host.locator('img.qr').getAttribute('src')).split(',')[1], 'base64'));
  const link = jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data;
  await host.waitForFunction(() => document.querySelector('.status-line')?.textContent?.includes('Waiting for the first phone'));
  console.log('PASS host connects despite a remembered WebSocket failure');
  const pc = await browser.newContext();
  await pc.addInitScript(() => {
    window.DeviceOrientationEvent = class extends Event { static async requestPermission() { return 'granted'; } };
    setInterval(() => {
      const event = new Event('deviceorientation');
      for (const [key, value] of Object.entries({ beta: -38, gamma: 0, alpha: 0 })) Object.defineProperty(event, key, { value });
      window.dispatchEvent(event);
    }, 16);
  });
  let blocked = true;
  let refused = 0;
  await pc.route('**://identitytoolkit.googleapis.com/**', (route) => {
    if (blocked) { refused++; return route.abort(); }
    return route.continue();
  });
  const phone = await pc.newPage(); observe(phone);
  await phone.goto(link);
  await phone.locator('button.big-button').click();
  await phone.waitForFunction(() => document.querySelector('.status-line')?.textContent === 'Reconnecting');
  await phone.waitForTimeout(1000);
  assert.ok(refused > 0, 'The initial sign-in was actually refused');
  blocked = false;
  await host.waitForFunction(() => document.querySelector('.hub-label')?.textContent === '1', null, { timeout: 20000 });
  console.log('PASS voter joins after the refused sign-in, without reloading');
  await phone.waitForTimeout(3500);
  lockedByTest = true;
  await host.getByRole('button', { name: 'Lock votes', exact: true }).click();
  await phone.waitForFunction(() => document.querySelector('.status-line')?.textContent === 'Round closed', null, { timeout: 12000 });
  console.log('PASS the recovered voter receives the locked round');
  await host.getByRole('button', { name: 'Reopen round', exact: true }).click();
  await phone.waitForFunction(() => document.querySelector('.status-line')?.textContent?.startsWith('Aiming at '));
  lockedByTest = false;
  console.log('PASS the recovered voter receives the reopened round');
} catch (error) {
  console.error(error.message.replaceAll(process.env.HOST_PASSCODE, '[REDACTED]'));
  process.exitCode = 1;
} finally {
  if (lockedByTest && host) await host.request.post(`${BASE}/api/host/reset`, { headers: { origin: BASE } }).catch(() => {});
  await browser.close();
  for (const identity of identities) await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${identity.key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: identity.token }),
  }).catch(() => {});
}
