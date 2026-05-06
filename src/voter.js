import puppeteer from 'puppeteer';

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGET_URL = 'https://mycutebaby.in/contest/participant/69f39325be245';
const MAX_RETRIES = 2;

// Pool of realistic user-agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sleep for a random duration between [min, max] milliseconds.
 */
const randomSleep = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
  );

/**
 * Pick a random element from an array.
 */
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Type into an element character-by-character like a human.
 */
const humanType = async (page, selector, text) => {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 80) + 40 });
  }
};

// ─── Puppeteer Browser Factory ────────────────────────────────────────────────

const launchBrowser = async () => {
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--window-size=1366,768',
    ],
    defaultViewport: { width: 1366, height: 768 },
  });
};

// ─── Core Vote Logic ──────────────────────────────────────────────────────────

/**
 * Attempt to cast a single vote.
 * Returns { success: boolean, message: string }
 */
const attemptVote = async () => {
  let browser = null;

  try {
    console.log(`[Voter] Launching browser...`);
    browser = await launchBrowser();
    const page = await browser.newPage();

    // ── Realistic browser fingerprint ──
    const userAgent = pickRandom(USER_AGENTS);
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    });

    // Mask automation flags
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3],
      });
      window.chrome = { runtime: {} };
    });

    // ── Navigate to page ──
    console.log(`[Voter] Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Human-like pause after page load
    await randomSleep(1500, 3500);

    // ── Auto-detect name input field ──
    const nameFieldSelector = await page.evaluate(() => {
      // Priority list of selectors to try for a "name" input
      const candidates = [
        'input[name*="name" i]',
        'input[placeholder*="name" i]',
        'input[id*="name" i]',
        'input[type="text"]',
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      ];
      for (const selector of candidates) {
        const el = document.querySelector(selector);
        if (el) return selector;
      }
      return null;
    });

    if (!nameFieldSelector) {
      throw new Error('Could not detect a name input field on the page.');
    }
    console.log(`[Voter] Found name field: ${nameFieldSelector}`);

    // Clear existing value, then type name human-style
    await page.click(nameFieldSelector, { clickCount: 3 });
    await randomSleep(300, 700);
    await humanType(page, nameFieldSelector, VOTER_NAME);
    console.log(`[Voter] Typed voter name: "${VOTER_NAME}"`);
    await randomSleep(800, 1800);

    // ── Auto-detect and click the vote button ──
    const voteButtonSelector = await page.evaluate(() => {
      const candidates = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:not([type="button"])',
        '[class*="vote" i]',
        '[id*="vote" i]',
        'button',
      ];
      for (const selector of candidates) {
        const els = [...document.querySelectorAll(selector)];
        // Prefer elements whose text contains "vote"
        const voteEl = els.find((el) =>
          /vote/i.test(el.textContent || el.value || '')
        );
        if (voteEl) {
          // Build a unique selector
          if (voteEl.id) return `#${voteEl.id}`;
          if (voteEl.className) {
            const cls = voteEl.className.split(' ')[0];
            return `${voteEl.tagName.toLowerCase()}.${cls}`;
          }
          return selector;
        }
      }
      // Fallback: first submit button
      const fallback = document.querySelector(
        'button[type="submit"], input[type="submit"]'
      );
      if (fallback) {
        if (fallback.id) return `#${fallback.id}`;
        return 'button[type="submit"]';
      }
      return null;
    });

    if (!voteButtonSelector) {
      throw new Error('Could not detect a vote button on the page.');
    }
    console.log(`[Voter] Found vote button: ${voteButtonSelector}`);

    // Smooth scroll button into view
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, voteButtonSelector);
    await randomSleep(600, 1200);

    // Click the vote button
    await page.click(voteButtonSelector);
    console.log(`[Voter] Clicked vote button. Waiting for confirmation...`);

    // ── Wait for success/confirmation signal ──
    const confirmationResult = await Promise.race([
      // Option A: URL changes (redirect to success page)
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).then(() => 'navigation'),

      // Option B: Success text appears in the DOM
      page
        .waitForFunction(
          () => {
            const body = document.body?.innerText?.toLowerCase() || '';
            return (
              body.includes('thank') ||
              body.includes('success') ||
              body.includes('voted') ||
              body.includes('recorded') ||
              body.includes('congratul')
            );
          },
          { timeout: 15000 }
        )
        .then(() => 'success-text'),
    ]).catch(() => 'timeout');

    console.log(`[Voter] Confirmation signal: "${confirmationResult}"`);

    // Capture final page state for logging
    const finalUrl = page.url();
    const pageSnippet = await page
      .evaluate(() => document.body?.innerText?.slice(0, 300))
      .catch(() => '');

    if (confirmationResult === 'timeout') {
      // Timeout is treated as a soft failure — the vote may still have gone through
      console.warn(`[Voter] No explicit confirmation received within 15 s. Final URL: ${finalUrl}`);
      console.warn(`[Voter] Page snippet: ${pageSnippet}`);
      return {
        success: false,
        message: `Timeout — no confirmation. Final URL: ${finalUrl}`,
      };
    }

    console.log(`[Voter] ✅ Vote submitted successfully! Final URL: ${finalUrl}`);
    return { success: true, message: `Vote confirmed via "${confirmationResult}". URL: ${finalUrl}` };
  } catch (error) {
    console.error(`[Voter] ❌ Error during vote attempt: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[Voter] Browser closed.`);
    }
  }
};

// ─── Public: Vote with Retry ──────────────────────────────────────────────────

/**
 * Cast a vote with automatic retry on failure.
 * Exported for use by the scheduler and manual triggers.
 */
export const castVote = async () => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Voter] ⏰ Vote cycle started at ${new Date().toISOString()}`);
  console.log(`${'─'.repeat(60)}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Voter] Attempt ${attempt} / ${MAX_RETRIES}`);

    const result = await attemptVote();

    if (result.success) {
      console.log(`[Voter] 🎉 Vote cast successfully on attempt ${attempt}.`);
      console.log(`[Voter] Message: ${result.message}`);
      return result;
    }

    console.warn(`[Voter] Attempt ${attempt} failed: ${result.message}`);

    if (attempt < MAX_RETRIES) {
      const waitMs = attempt * 8000 + Math.floor(Math.random() * 4000); // 8–12 s, 16–20 s
      console.log(`[Voter] Retrying in ${(waitMs / 1000).toFixed(1)} s...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  const finalMessage = `All ${MAX_RETRIES} attempts failed.`;
  console.error(`[Voter] ❌ ${finalMessage}`);
  return { success: false, message: finalMessage };
};
