import puppeteer from 'puppeteer';

const TARGET_URL = 'https://mycutebaby.in/contest/participant/69f39325be245';
const MAX_RETRIES = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const sleep = (min, max) =>
  new Promise((r) => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const launchBrowser = async () =>
  puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

const attemptVote = async () => {
  let browser = null;
  try {
    console.log('[Voter] Launching browser...');
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(pickRandom(USER_AGENTS));
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    console.log(`[Voter] Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000, 5000);

    // ── REMOVE ADS & POPUPS (They block clicks) ──────────────────────────
    console.log('[Voter] Removing ads and overlays...');
    await page.evaluate(() => {
      const selectors = [
        'iframe', '.adsbygoogle', '#google_ads_frame', '[id^="google_ads"]',
        '.modal', '.fade', '.show', '[class*="popup"]', '[id*="popup"]',
        '#fan_box', '.fc-consent-root'
      ];
      selectors.forEach(s => {
        document.querySelectorAll(s).forEach(el => el.remove());
      });
    });
    await sleep(1000, 2000);

    // ── FULL PAGE DUMP ──────────────────────────────────────────────────────
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
    console.log('[Voter] PAGE TEXT DUMP:\n' + pageText);

    const allButtons = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, input[type="submit"], div[onclick], span[onclick]')];
      return els.map((el) => ({
        tag: el.tagName,
        id: el.id || '',
        cls: el.className || '',
        text: (el.textContent || el.value || '').trim().slice(0, 80),
        visible: el.offsetParent !== null,
      }));
    });
    console.log('[Voter] ALL CLICKABLE ELEMENTS:\n' + JSON.stringify(allButtons, null, 2));

    // ── Cooldown check ──────────────────────────────────────────────────────
    const lowerText = pageText.toLowerCase();
    const onCooldown =
      lowerText.includes('you can vote again') ||
      lowerText.includes('vote again at') ||
      lowerText.includes('vote button will appear');

    if (onCooldown) {
      console.log('[Voter] ⏳ Cooldown active — skipping.');
      return { success: false, reason: 'cooldown', message: 'Cooldown active' };
    }

    // ── Find TAP TO VOTE button ─────────────────────────────────────────────
    // Site already remembers voter name — just click the green button
    const voteHandle = await page.evaluateHandle(() => {
      const all = [...document.querySelectorAll('button, a, div, span, input[type="submit"]')];

      // 1. Text match: "TAP TO VOTE"
      const byText = all.find((el) =>
        /tap\s+to\s+vote/i.test((el.textContent || el.value || '').trim())
      );
      if (byText) return byText;

      // 2. Any element with "vote" in class
      const byClass = document.querySelector('[class*="vote" i]');
      if (byClass) return byClass;

      // 3. Any onclick attribute containing "vote"
      const byOnclick = all.find((el) =>
        /vote/i.test(el.getAttribute('onclick') || '')
      );
      if (byOnclick) return byOnclick;

      // 4. Green background element (heuristic)
      const byColor = all.find((el) => {
        const bg = window.getComputedStyle(el).backgroundColor;
        return bg && (bg.includes('0, 128') || bg.includes('34, 197') || bg.includes('21, 128'));
      });
      if (byColor) return byColor;

      // 5. Any button / submit
      return document.querySelector('button, input[type="submit"]');
    });

    const btnExists = await page.evaluate((el) => !!el && el.offsetParent !== null, voteHandle);

    if (!btnExists) {
      console.error('[Voter] ❌ No visible button found on page.');
      return { success: false, reason: 'no-button', message: 'TAP TO VOTE button not found' };
    }

    const btnInfo = await page.evaluate((el) => ({
      tag: el.tagName,
      id: el.id,
      cls: el.className,
      text: (el.textContent || el.value || '').trim().slice(0, 80),
    }), voteHandle);
    console.log(`[Voter] ✅ Clicking button: ${JSON.stringify(btnInfo)}`);

    // Scroll + human mouse move
    await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), voteHandle);
    await sleep(600, 1200);

    const box = await voteHandle.boundingBox();
    if (box) {
      await page.mouse.move(
        box.x + box.width / 2 + Math.floor(Math.random() * 10 - 5),
        box.y + box.height / 2 + Math.floor(Math.random() * 6 - 3),
        { steps: Math.floor(Math.random() * 8) + 5 }
      );
      await sleep(200, 500);
    }

    await voteHandle.click();
    console.log('[Voter] 🖱️  Clicked. Waiting for confirmation...');

    // ── Wait for success or cooldown timer to appear ────────────────────────
    const signal = await Promise.race([
      page.waitForFunction(
        () => {
          const t = (document.body?.innerText || '').toLowerCase();
          return (
            t.includes('thank') ||
            t.includes('voted') ||
            t.includes('success') ||
            t.includes('recorded') ||
            t.includes('congratul') ||
            t.includes('you can vote again') ||
            t.includes('vote again at')
          );
        },
        { timeout: 20000 }
      ).then(() => 'text-confirmed'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).then(() => 'navigated'),
    ]).catch(() => 'timeout');

    const finalUrl = page.url();
    const finalText = await page.evaluate(() => document.body?.innerText?.slice(0, 300)).catch(() => '');
    console.log(`[Voter] Signal: "${signal}". URL: ${finalUrl}`);
    console.log(`[Voter] Final page: ${finalText.slice(0, 200)}`);

    if (signal === 'timeout') {
      return { success: false, reason: 'timeout', message: `Timeout. URL: ${finalUrl}` };
    }

    console.log('[Voter] 🎉 Vote SUCCESS!');
    return { success: true, message: `Confirmed via "${signal}". URL: ${finalUrl}` };

  } catch (err) {
    console.error(`[Voter] ❌ Exception: ${err.message}`);
    return { success: false, reason: 'exception', message: err.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log('[Voter] 🔒 Browser closed.');
    }
  }
};

export const castVote = async () => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Voter] ⏰ Cycle started: ${new Date().toISOString()}`);
  console.log(`${'─'.repeat(60)}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Voter] Attempt ${attempt}/${MAX_RETRIES}`);
    const result = await attemptVote();

    if (result.reason === 'cooldown') {
      return { success: false, reason: 'cooldown', message: result.message };
    }
    if (result.success) {
      return result;
    }

    console.warn(`[Voter] Attempt ${attempt} failed: ${result.message}`);
    if (attempt < MAX_RETRIES) {
      const wait = 8000 + Math.floor(Math.random() * 4000);
      console.log(`[Voter] ⟳ Retrying in ${(wait / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return { success: false, message: `All ${MAX_RETRIES} attempts failed.` };
};
