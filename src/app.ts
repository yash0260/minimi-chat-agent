import express from 'express';
import { chat } from './agent.js';
import { getSessions, getRecentMessages } from './db.js';

const app = express();
app.use(express.json());

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
