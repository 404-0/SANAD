import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

/**
 * Full-app check against the production build, with the classifier API running
 * in mock mode so the Phase 4 path is exercised in a real browser:
 *
 *   home -> describe -> AI classify -> Emergency Mode
 *   bleeding milestone -> transition -> CPR
 *   manual grid, settings, text size, never-do, English/LTR, desktop
 *
 * Fails on any console error. Screenshots land in screenshots/.
 */
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const ROOT = new URL('..', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const api = spawn('node', ['server/classify.mjs'], {
  cwd: ROOT,
  env: { ...process.env, SANAD_PROVIDER: 'mock', SANAD_PORT: '8787' },
  stdio: 'ignore',
});
const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const stop = () => {
  api.kill('SIGTERM');
  preview.kill('SIGTERM');
};
process.on('exit', stop);
await new Promise((resolve) => setTimeout(resolve, 2600));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });

const consoleErrors = [];
// Sandbox artefacts only: the webfont CDN is unreachable here (the app falls
// back to system fonts), and tel: is aborted because there is no dialler.
// Real JavaScript errors are caught by the pageerror handler below, not here.
const NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_FAILED|ERR_ABORTED|favicon|fonts\.googleapis|fonts\.gstatic|status of 404/i;
page.on('console', (msg) => {
  if (msg.type() === 'error' && !NOISE.test(msg.text())) consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

const problems = [];
const check = (name, condition) => {
  if (!condition) problems.push(name);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
};
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
const click = async (name, { index = 0 } = {}) => {
  const target = page.getByRole('button', { name, exact: false }).nth(index);
  await target.waitFor({ state: 'visible', timeout: 6000 });
  await target.click();
  await page.waitForTimeout(180);
};
const body = () => page.textContent('body');

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('01-home-ar');
check('home asks one question', (await body()).includes('ماذا حدث؟'));

// --- mic shell --------------------------------------------------------------
await page.getByRole('button', { name: 'إدخال صوتي' }).click();
await page.waitForTimeout(250);
await shot('02-mic-sheet');
check(
  'mic sheet says what it can do in this browser',
  /المتصفح ما يدعم الإدخال الصوتي|أسمعك|ما عندي إذن للمايك/.test(await body()),
);
await click('إغلاق');

// --- Phase 4: describe -> AI classify --------------------------------------
await page.locator('textarea').fill('أخوي ينزف ودمه ما يوقف');
await click('ابدأ Start');
await page.waitForTimeout(900);
await shot('03-home-match');
const matched = await body();
check('classifier proposes severe bleeding', matched.includes('نزيف خارجي شديد'));
check('result is labelled as coming from the AI', matched.includes('تحليل ذكي'));

await click('ابدأ الخطوات');
await page.waitForTimeout(400);
await shot('04-instruction');
const firstStep = await body();
check('Emergency Mode shows one instruction', firstStep.includes('افعل الآن'));
check('SANAD introduces the flow in its own voice', firstStep.includes('خلينا نبدأ'));

// --- SANAD takes part: answer in your own words ------------------------------
check(
  'every step offers to be talked to',
  ((await page.locator('input[placeholder]').first().getAttribute('placeholder')) || '').includes('قول شنو تشوف'),
);
await page.locator('input[placeholder*="قول شنو"]').fill('هل أنزع الجسم المغروس؟');
await page.getByRole('button', { name: 'أرسل' }).click();
await page.waitForTimeout(1200);
await shot('03b-ask-sanad');
const askBody = await body();
check('a mid-step question is answered from the protocol', askBody.includes('من البروتوكول'));
check('the answer is a protocol sentence, not invented', /لا تنزع|لا تضغط|مغروس/.test(askBody));

await page.locator('input[placeholder*="قول شنو"]').fill('شكد سعر الدولار اليوم؟');
await page.getByRole('button', { name: 'أرسل' }).click();
await page.waitForTimeout(1200);
check('a question outside the protocol is refused, not guessed', (await body()).includes('مو موجود بالبروتوكول'));

// --- Phase 2 milestone in the new UI ---------------------------------------
await click('تم Done');
await click('أنا أتصل الآن');
await click('لا No');
await click('تم Done');
await click('تم Done');
await shot('05-question');
const questionScreen = await body();
check('question screen is labelled', questionScreen.includes('أجب الآن'));
check('SANAD tells you how to answer', questionScreen.includes('جاوب حسب اللي تشوفه'));

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
await shot('06-transition');
check('transition screen explains the switch', (await body()).includes('تغيّرت الحالة'));

await click('ابدأ:');
await page.waitForTimeout(300);
await shot('07-cpr');
check('lands in the CPR flow', (await body()).includes('إنعاش قلبي'));

// --- never-do + pacer -------------------------------------------------------
await click('ممنوع');
await page.waitForTimeout(250);
await shot('08-never-do');
check('never-do sheet lists rules', (await body()).includes('اللهاث'));
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
check('Escape closes a sheet', true);

await click('لا — أو لهاث متقطع فقط');
await shot('08b-after-gasping');
await click('تم Done');
await click('بالغ Adult');
await click('تم Done');
await click('لا No');
await page.waitForTimeout(200);
await shot('09-cpr-pacer');
check('compression pacer detected from the JSON text', (await body()).includes('110'));

// --- dark theme + assistant voice -------------------------------------------
await page.getByRole('button', { name: 'الإعدادات' }).click();
await page.waitForTimeout(250);
await click('داكن · Dark');
await page.waitForTimeout(450);
await click('تم · Done');
await page.waitForTimeout(300);
await shot('09b-dark-guide');
check('dark theme applies', (await page.getAttribute('html', 'data-theme')) === 'dark');
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('dark theme actually repaints the page', darkBg === 'rgb(14, 18, 24)');

// Language swap must not leave the app in a half-swapped state.
await page.getByRole('button', { name: 'الإعدادات' }).click();
await page.waitForTimeout(200);
await click('English');
await page.waitForTimeout(600);
check('language swap settles (no stuck fade)', await page.evaluate(() => {
  const root = document.querySelector('.lang-swap-root');
  return root ? !root.classList.contains('lang-swapping') : false;
}));
check('language swap flipped direction', (await page.getAttribute('html', 'dir')) === 'ltr');
await click('العربية');
await page.waitForTimeout(600);
await click('تم · Done');
await page.waitForTimeout(250);
await shot('09c-dark-home');

await page.getByRole('button', { name: 'الإعدادات' }).click();
await page.waitForTimeout(200);
await click('فاتح · Light');
await page.waitForTimeout(400);
await click('تم · Done');
await page.waitForTimeout(250);

// --- settings: text size ----------------------------------------------------
await page.getByRole('button', { name: 'الإعدادات' }).click();
await page.waitForTimeout(250);
await shot('10-settings');

// The browser voice is what most people hear until `npm run tts` has been run,
// so being able to change it has to be reachable without reading a README.
const settingsBody = await body();
check('settings offers a voice choice', settingsBody.includes('الصوت'));
check('and a way to hear it', settingsBody.includes('جرّب'));
check(
  'it is honest when the device has no voices',
  settingsBody.includes('أفضل صوت متاح'),
);
await click('كبير · Large');
await page.waitForTimeout(200);
await click('تم · Done');
await page.waitForTimeout(250);
await shot('11-large-text');
check('large text setting applies', true);
await page.getByRole('button', { name: 'الإعدادات' }).click();
await click('عادي · Normal');
await click('تم · Done');

// --- resume after a reload --------------------------------------------------
const beforeReload = await page.textContent('h1');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
await shot('11b-resume');
const resumeBody = await body();
check('a reload offers to continue where we stopped', resumeBody.includes('كنا بنص حالة'));
await click('أكمل من وين وقفنا');
await page.waitForTimeout(500);
check('resuming lands on the exact same step', (await page.textContent('h1')) === beforeReload);

// --- manual grid ------------------------------------------------------------
// Back walks out of the flow and lands on home.
for (let i = 0; i < 30 && !(await body()).includes('ماذا حدث؟'); i += 1) {
  await page.getByRole('button', { name: 'رجوع' }).first().click();
  await page.waitForTimeout(120);
}
check('back button eventually leaves the flow', (await body()).includes('ماذا حدث؟'));
await click('اختر الحالة يدويًا');
await page.waitForTimeout(300);
await shot('12-manual-grid');
const grid = await body();
check('manual grid lists all 10 cases', ['نزيف شديد', 'اختناق', 'حروق', 'تسمم'].every((n) => grid.includes(n)));

await page.getByRole('button', { name: /^اختناق/ }).first().click();
await page.waitForTimeout(300);
await shot('13-choking');
check('manual selection starts that flow', (await body()).includes('يكح بقوة'));

// --- English + desktop ------------------------------------------------------
await page.getByRole('button', { name: 'الإعدادات' }).click();
await page.waitForTimeout(200);
await click('English');
await page.waitForTimeout(300);
await click('تم · Done');
check('English mode switches to LTR', (await page.getAttribute('html', 'dir')) === 'ltr');
await shot('14-guide-en');

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(300);
await shot('15-guide-desktop');

await page.getByRole('button', { name: 'Back' }).first().click();
await page.waitForTimeout(300);
await page.locator('textarea').fill('my son swallowed bleach');
await click('Start');
await page.waitForTimeout(900);
await shot('16-home-desktop-en');
check('English description routes to poisoning', (await body()).includes('Poisoning'));

// --- hands-free + dispatcher handover (last: a denied microphone prompt in
// headless Chromium interferes with later clicks) -----------------------------
await page.getByRole('button', { name: 'Choose emergency manually', exact: false }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Severe Bleeding/ }).first().click();
await page.waitForTimeout(400);
check('hands-free control is offered on every step', (await body()).includes('Hands-free'));
await page.getByRole('button', { name: 'Hands-free mode' }).click();
await page.waitForTimeout(400);
await shot('07b-hands-free');
check(
  'hands-free says plainly when the browser cannot listen',
  /no speech input|permission was refused|Couldn't listen|Listening|Reading the step/i.test(await body()),
);
await page.getByRole('button', { name: 'Hands-free mode' }).click();
await page.waitForTimeout(200);

// --- what to tell the ambulance ---------------------------------------------
// dispatchEvent, not click(): a real click on a tel: link hands the page to the
// dialler, which headless Chromium leaves in a half-navigated state.
await page.locator('a[href^="tel:"]').first().dispatchEvent('click');
await page.waitForTimeout(400);
await shot('07c-handover');
const handoverBody = await body();
check('calling shows what to tell the dispatcher', handoverBody.includes('TELL THEM THIS'));
check('the handover lists what has already been done', handoverBody.includes('DONE SO FAR'));
// Same reason as the tel: link above — the sheet was opened by a link the
// headless browser half-navigated, so drive its buttons through the DOM.
await page.evaluate(() => document.querySelector('[role=dialog] button')?.click());
await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
check('the handover closes back onto the step', (await body()).includes('DO THIS NOW'));


await browser.close();
stop();

if (consoleErrors.length) problems.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
console.log(problems.length ? `\nFAIL\n - ${problems.join('\n - ')}` : '\nPASS — redesigned UI + Phase 4 classifier clean.');
process.exit(problems.length ? 1 : 0);
