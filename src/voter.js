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
      '--no-zygote',
      '--single-process', // Saves RAM
      '--disable-extensions',
    ],
    defaultViewport: { width: 800, height: 600 }, // Smaller viewport = less RAM
  });

const attemptVote = async () => {
  let browser = null;
  try {
    console.log('[Voter] Launching browser (Memory Optimized)...');
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Block Images & CSS to save RAM/Speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

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

    // ── REMOVE ADS & POPUPS (More aggressive) ──────────────────────────
    console.log('[Voter] Nuking ads and overlays...');
    await page.evaluate(() => {
      const selectors = [
        'iframe', 'ins', '.adsbygoogle', '#google_ads_frame', '[id^="google_ads"]',
        '.modal', '.fade', '.show', '[class*="popup"]', '[id*="popup"]',
        '#fan_box', '.fc-consent-root', '[id*="google_vignette"]', '.google-vignette-container',
        '#aswift_0_host', '#aswift_0_expand', '#aswift_1_host', '#aswift_1_expand'
      ];
      selectors.forEach(s => {
        document.querySelectorAll(s).forEach(el => {
          el.style.display = 'none';
          el.remove();
        });
      });
      // Also remove any full-screen overlays that might be invisible
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (window.getComputedStyle(el).zIndex > 1000) el.remove();
      }
    });
    await sleep(2000, 3000);

    // ── Find TAP TO VOTE button ─────────────────────────────────────────────
    const voteHandle = await page.evaluateHandle(() => {
      const all = [...document.querySelectorAll('button, a, div, span, input[type="submit"]')];
      return all.find((el) => /tap\s+to\s+vote/i.test((el.textContent || el.value || '').trim()));
    });

    const btnExists = await page.evaluate((el) => !!el && el.offsetParent !== null, voteHandle);
    if (!btnExists) {
      console.error('[Voter] ❌ No button found.');
      return { success: false, reason: 'no-button', message: 'Button not found' };
    }

    // Scroll + human mouse move
    await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), voteHandle);
    await sleep(1000, 2000);

    await voteHandle.click();
    console.log('[Voter] 🖱️  Clicked. Waiting 10s to verify...');
    await sleep(10000, 12000); // Wait for the site to process the vote

    // ── VERIFICATION: Is the button still there? ──────────────────────────
    const stillThere = await page.evaluate(() => {
      const all = [...document.querySelectorAll('button, a, div, span, input[type="submit"]')];
      const btn = all.find((el) => /tap\s+to\s+vote/i.test((el.textContent || el.value || '').trim()));
      return !!btn && btn.offsetParent !== null;
    });

    if (stillThere) {
      console.warn('[Voter] ⚠️  Button is still visible! Click failed.');
      return { success: false, message: 'Button still visible after click' };
    }

    const finalUrl = page.url();
    console.log(`[Voter] 🎉 Vote SUCCESS! Final URL: ${finalUrl}`);
    return { success: true, message: `Vote confirmed (button disappeared). URL: ${finalUrl}` };

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
