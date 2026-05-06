# Render Deployment Instructions

## Deploy to Render (Free Tier)

### Prerequisites
- GitHub account with this repository pushed
- Render account (https://render.com)

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: voting bot"
git remote add origin https://github.com/YOUR_USERNAME/voting-bot.git
git push -u origin main
```

---

## Step 2 — Create a New Web Service on Render

1. Log in at https://render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:

| Setting | Value |
|---|---|
| **Name** | `voting-bot` (or any name) |
| **Region** | Singapore / Oregon (your choice) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node src/server.js` |
| **Instance Type** | Free |

---

## Step 3 — Environment Variables (Optional)

In Render dashboard → Environment → Add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | *(leave blank — Render sets this automatically)* |

---

## Step 4 — Deploy

Click **"Create Web Service"**. Render will:
1. Pull your code from GitHub
2. Run `npm install` (installs Puppeteer + Chromium automatically)
3. Start the server with `node src/server.js`

Puppeteer will download Chromium during `npm install`. This is automatic on Render.

---

## Step 5 — Keep Alive (Prevent Render Free Tier Sleep)

Render free tier spins down after 15 min of inactivity.  
To prevent this, use **UptimeRobot** (free):

1. Go to https://uptimerobot.com
2. Create a new monitor:
   - **Monitor Type**: HTTP(s)
   - **URL**: `https://your-app.onrender.com/health`
   - **Check Interval**: 5 minutes
3. Save — this will ping your app every 5 minutes, keeping it alive.

---

## Endpoints After Deployment

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Returns "Voting Bot Running 🗳️" |
| `/health` | GET | JSON health check with bot stats |
| `/logs` | GET | Last 50 vote results |
| `/vote/now` | POST | Manually trigger an immediate vote |

---

## Verifying the Bot Works

```bash
# Check health
curl https://your-app.onrender.com/health

# See vote logs
curl https://your-app.onrender.com/logs

# Trigger a vote manually
curl -X POST https://your-app.onrender.com/vote/now
```

---

## Render Build Notes

- Puppeteer `v22+` automatically downloads Chromium during `npm install`
- The `--no-sandbox` and `--disable-setuid-sandbox` flags are **required** on Render (already set in `voter.js`)
- `--disable-dev-shm-usage` prevents memory issues in the Render container

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Error: Could not find Chrome` | Make sure `puppeteer` (not `puppeteer-core`) is in dependencies |
| `No sandbox` error | Already handled — `--no-sandbox` flag is set |
| App sleeps on Render free | Set up UptimeRobot as described above |
| Vote not detected | Check `/logs` endpoint for the error message |
| Out of memory | Upgrade to Render Starter ($7/mo) for 512MB RAM |
