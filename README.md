# minimi chat agent

A chat agent with persistent conversation memory and live fact verification, built on Gemini's function-calling API. Deployable to Vercel.

---

## Step 1 — Get API keys

### Gemini API key (required, free)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **Create API key** → select any Google Cloud project (or create one)
4. Copy the key (starts with `AIza...`)

### Tavily API key (optional — enables web search)

1. Go to **https://tavily.com** and sign up
2. Free tier gives 1000 searches/month
3. Copy your API key from the dashboard

> Without Tavily, the agent still works — it just can't verify facts against live web data.

---

## Step 2 — Run locally

```bash
cd minimi-chat-agent

# Create your .env file
cp .env.example .env
```

Open `.env` in a text editor and fill in your Gemini key:

```
GEMINI_API_KEY=AIzaSy...your-key-here
TAVILY_API_KEY=tvly-...your-key-here
```

> Leave TURSO_DATABASE_URL and TURSO_AUTH_TOKEN commented out — local dev uses a file-based SQLite automatically.

Install and run:

```bash
npm install
npm run dev
```

You should see:

```
  minimi chat agent
  ──────────────────
  → http://localhost:3000
```

Open **http://localhost:3000** in your browser. Send a few messages to test it.

---

## Step 3 — Set up Turso (free cloud database for Vercel)

Vercel's serverless functions can't use local files, so we need a cloud database. Turso gives you hosted SQLite for free.

1. Go to **https://turso.tech** and sign up (GitHub login works)
2. Once in the dashboard, click **Create Database**
3. Name it `minimi-chat` → pick the closest region → create
4. Click on your new database → go to the **"Connect"** tab (or look for connection details)
5. Copy two values:
   - **Database URL** — looks like `libsql://minimi-chat-yourname.turso.io`
   - **Auth Token** — click "Generate Token" or "Create Token", copy it

Keep these for the next step.

---

## Step 4 — Push to GitHub

Create a new repo on GitHub:

1. Go to **https://github.com/new**
2. Name: `minimi-chat-agent`
3. Keep it **Public**
4. Don't add README/gitignore (we already have them)
5. Click **Create repository**

Then push your code:

```bash
git add -A
git commit -m "ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/minimi-chat-agent.git
git branch -M main
git push -u origin main
```

---

## Step 5 — Deploy to Vercel

1. Go to **https://vercel.com** and sign up (use your GitHub account)
2. Click **"Add New..." → Project**
3. Import your `minimi-chat-agent` repo from GitHub
4. **Before clicking Deploy**, expand **Environment Variables** and add these:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | Your Gemini API key |
   | `TURSO_DATABASE_URL` | `libsql://minimi-chat-yourname.turso.io` |
   | `TURSO_AUTH_TOKEN` | Your Turso auth token |
   | `TAVILY_API_KEY` | Your Tavily key *(optional)* |

5. Click **Deploy**
6. Wait ~60 seconds. Vercel builds and deploys your app
7. You'll get a URL like `https://minimi-chat-agent.vercel.app` — that's your live agent!

---

## Step 6 — Test the two key features

### Conversation memory

1. Open your deployed app and send a few messages (e.g., ask about Postgres hosting)
2. Click **New chat** to start a fresh session
3. Ask: *"What did I ask you in my previous conversation?"*
4. The agent searches its database and recalls the earlier exchange

### Fact verification

1. Ask a factual question (e.g., *"What's the pricing for Neon Postgres?"*)
2. Later, ask: *"Is your answer about Postgres pricing still correct today?"*
3. The agent recalls the original answer, searches the web for current data, and compares

---

## Project structure

```
src/
  app.ts       Express routes (shared between local dev and Vercel)
  index.ts     Local dev entry point (loads .env, serves static files, starts server)
  agent.ts     Gemini function-calling loop — the core
  tools.ts     Function declarations + execution (recall, web search)
  db.ts        Database layer (libsql — local SQLite or cloud Turso)
api/
  index.ts     Vercel serverless function entry point
public/
  index.html   Chat UI
vercel.json    Vercel deployment config
```

See **[DESIGN.md](DESIGN.md)** for architecture decisions and trade-offs.
