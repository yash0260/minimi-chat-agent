import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { chat } from './agent.js';
import { getSessions, getRecentMessages } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

function getIndexPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(__dirname, '..', 'public', 'index.html'),
    path.join(__dirname, 'public', 'index.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const publicCwd = path.join(process.cwd(), 'public');
if (fs.existsSync(publicCwd)) {
  app.use(express.static(publicCwd));
}
const publicRelative = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicRelative)) {
  app.use(express.static(publicRelative));
}

app.get('/', (_req, res) => {
  const p = getIndexPath();
  if (p) {
    res.sendFile(p);
  } else {
    res.status(404).send('index.html not found');
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    res.status(400).json({ error: 'message and sessionId are required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of chat(sessionId, message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    res.write(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`);
  }

  res.end();
});

app.get('/api/sessions', async (_req, res) => {
  try {
    res.json(await getSessions());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    res.json(await getRecentMessages(req.params.id, 200));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

export default app;
