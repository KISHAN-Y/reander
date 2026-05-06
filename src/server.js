import express from 'express';
import cron from 'node-cron';
import { castVote } from './voter.js';

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory log store (last 50 entries)
const voteLog = [];
const MAX_LOG = 50;

const addLog = (entry) => {
  voteLog.unshift({ ...entry, ts: new Date().toISOString() });
  if (voteLog.length > MAX_LOG) voteLog.pop();
};

// Track bot state
const botState = {
  startedAt: new Date().toISOString(),
  totalAttempts: 0,
  successCount: 0,
  failureCount: 0,
  lastRun: null,
  lastResult: null,
  nextRunAt: null,
};

// ─── Routes ───────────────────────────────────────────────────────────────────

// Root — confirms service is alive
app.get('/', (_req, res) => {
  res.send('Voting Bot Running 🗳️');
});

// Health check — used by Render uptime monitoring
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      uptime: process.uptime().toFixed(2) + 's',
      ...botState,
    },
    meta: { timestamp: Date.now() },
  });
});

// Recent vote history
app.get('/logs', (_req, res) => {
  res.status(200).json({
    success: true,
    data: voteLog,
    meta: { timestamp: Date.now(), count: voteLog.length },
  });
});

// Manual vote trigger (useful for testing on Render)
app.post('/vote/now', async (_req, res) => {
  console.log('[Server] Manual vote triggered via POST /vote/now');
  // Fire-and-forget, respond immediately
  res.status(202).json({
    success: true,
    data: { message: 'Vote triggered. Check /logs for result.' },
    meta: { timestamp: Date.now() },
  });
  runVoteCycle();
});

// ─── Vote Cycle (shared by cron + manual trigger) ─────────────────────────────

const runVoteCycle = async () => {
  botState.totalAttempts++;
  botState.lastRun = new Date().toISOString();

  let result;
  try {
    result = await castVote();
  } catch (err) {
    // Safety net — castVote should never throw but we guard anyway
    result = { success: false, message: err.message };
  }

  botState.lastResult = result;
  if (result.success) {
    botState.successCount++;
  } else {
    botState.failureCount++;
  }

  addLog({ ...result, attempt: botState.totalAttempts });
};

// ─── Cron Scheduler ───────────────────────────────────────────────────────────
// Runs every 31 minutes — "*/31 * * * *"
const CRON_EXPRESSION = '*/31 * * * *';

const startScheduler = () => {
  const job = cron.schedule(CRON_EXPRESSION, async () => {
    console.log(`\n[Cron] ⏰ Scheduled vote triggered at ${new Date().toISOString()}`);
    await runVoteCycle();

    // Calculate next run
    const next = new Date(Date.now() + 31 * 60 * 1000);
    botState.nextRunAt = next.toISOString();
    console.log(`[Cron] Next vote scheduled at: ${botState.nextRunAt}`);
  });

  job.start();

  // Calculate first next run
  const firstNext = new Date(Date.now() + 31 * 60 * 1000);
  botState.nextRunAt = firstNext.toISOString();

  console.log(`[Cron] ✅ Scheduler started. Cron: "${CRON_EXPRESSION}"`);
  console.log(`[Cron] First vote will run at: ${botState.nextRunAt}`);
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🗳️  Voting Bot Server`);
  console.log(`  Listening on port ${PORT}`);
  console.log(`  Started at: ${botState.startedAt}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Start cron scheduler
  startScheduler();

  // Cast the first vote immediately on startup (no need to wait 31 min)
  console.log('[Server] Running initial vote on startup...');
  await runVoteCycle();
});
