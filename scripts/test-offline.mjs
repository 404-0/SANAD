import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

/**
 * Phase 6, the part that matters most in the field: once SANAD has been opened
 * one time, it must work with the network completely off — no app shell fetch,
 * no flow fetch, no classifier. This loads the app, kills the network, reloads,
 * and drives a full case through to a transition.
 */
const ROOT = new URL('..', import.meta.url).pathname;
const preview = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
});
process.on('exit', () => preview.kill('SIGTERM'));
await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await context.newPage();

const problems = [];
const check = (name, condition) => {
  if (!condition) problems.push(name);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
};
const body = () => page.textContent('body');
const click = async (name) => {
  const target = page.getByRole('button', { name, exact: false }).first();
  await target.waitFor({ state: 'visible', timeout: 6000 });
  await target.click();
  await page.waitForTimeout(200);
};

// First visit, online: the service worker installs and precaches everything.
await page.goto('http://localhost:4181/', { waitUntil: 'networkidle' });
const registered = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  return Boolean(registration.active);
});
check('service worker installs and activates', registered);

const manifest = await page.evaluate(async () => {
  const response = await fetch('/manifest.webmanifest');
  return response.json();
});
check('web app manifest is installable', manifest.name.includes('SANAD') && manifest.icons.length >= 2);
check('manifest is standalone with an app icon', manifest.display === 'standalone');

await page.waitForTimeout(1200); // let precaching finish

// Now cut the network entirely.
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
check('app still loads with the network off', (await body()).includes('ماذا حدث؟'));

// The classifier is unreachable — the offline matcher has to answer instead.
await page.locator('textarea').fill('أخوي ينزف ودمه ما يوقف');
await click('ابدأ Start');
await page.waitForTimeout(1200);
const offlineResult = await body();
check('offline description still routes to the right case', offlineResult.includes('نزيف خارجي شديد'));
check('and it is honestly labelled as an offline match', offlineResult.includes('مطابقة محلية'));

// A whole case, offline, including a cross-flow transition.
await click('ابدأ الخطوات');
await page.waitForTimeout(300);
check('a flow runs offline', (await body()).includes('اضغط بقوة'));

for (const step of ['تم Done', 'أنا أتصل الآن', 'لا No', 'تم Done', 'تم Done']) await click(step);
await click('نعم Yes');
await click('ذراع أو ساق');
await click('نعم Yes');
await click('تم Done');
await click('تم Done');
await click('نعم Yes');
await click('تم Done');
await click('تم Done');
await click('لا No');
await click('تم Done');
await click('لا No');
await page.waitForTimeout(300);
check('cross-flow transition works offline', (await body()).includes('تغيّرت الحالة'));

await click('ابدأ:');
await page.waitForTimeout(300);
check('the CPR flow opens offline', (await body()).includes('إنعاش قلبي'));

// Manual selection must never depend on anything remote.
await context.setOffline(true);
for (let i = 0; i < 30 && !(await body()).includes('ماذا حدث؟'); i += 1) {
  await page.getByRole('button', { name: 'رجوع' }).first().click();
  await page.waitForTimeout(120);
}
await click('اختر الحالة يدويًا');
await page.waitForTimeout(300);
check('manual selection works offline', (await body()).includes('اختناق'));

await browser.close();
preview.kill('SIGTERM');

console.log(problems.length ? `\nFAIL\n - ${problems.join('\n - ')}` : '\nPASS — SANAD works with the network off.');
process.exit(problems.length ? 1 : 0);
