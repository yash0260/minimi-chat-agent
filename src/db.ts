import { createClient, type Client, type InStatement, type InValue } from '@libsql/client';

let db: Client;
let ready = false;

function getClient(): Client {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:chat.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

async function init(): Promise<void> {
  if (ready) return;
  const c = getClient();
  await c.batch([
    `CREATE TABLE IF NOT EXISTS messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       session_id TEXT NOT NULL,
       role TEXT NOT NULL,
       content TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(created_at)`,
  ] as InStatement[]);
  ready = true;
}

export interface Message {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: Number(r.id),
    session_id: String(r.session_id),
    role: String(r.role) as 'user' | 'assistant',
    content: String(r.content),
    created_at: String(r.created_at),
  };
}

export async function saveMessage(sessionId: string, role: string, content: string): Promise<void> {
  await init();
  await getClient().execute({
    sql: 'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
    args: [sessionId, role, content],
  });
}

export async function getRecentMessages(sessionId: string, limit = 30): Promise<Message[]> {
  await init();
  const result = await getClient().execute({
    sql: `SELECT * FROM (
            SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?
          ) ORDER BY id ASC`,
    args: [sessionId, limit],
  });
  return result.rows.map(r => rowToMessage(r as Record<string, unknown>));
}

export async function search(params: {
  query?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Message[]> {
  await init();

  const conditions: string[] = [];
  const args: InValue[] = [];

  if (params.date) {
    conditions.push('date(created_at) = ?');
    args.push(params.date);
  }
  if (params.dateFrom) {
    conditions.push('created_at >= ?');
    args.push(params.dateFrom);
  }
  if (params.dateTo) {
    conditions.push("created_at < datetime(?, '+1 day')");
    args.push(params.dateTo);
  }
  if (params.query) {
    conditions.push('content LIKE ?');
    args.push(`%${params.query}%`);
  }

  if (conditions.length === 0) return [];

  const where = conditions.join(' AND ');
  const result = await getClient().execute({
    sql: `SELECT * FROM messages WHERE ${where} ORDER BY created_at ASC LIMIT 40`,
    args,
  });

  return result.rows.map(r => rowToMessage(r as Record<string, unknown>));
}

export async function getSessions(): Promise<
  { session_id: string; last_message: string; message_count: number; started_at: string; last_at: string }[]
> {
  await init();
  const result = await getClient().execute(`
    SELECT
      session_id,
      (SELECT content FROM messages m2 WHERE m2.session_id = m.session_id AND m2.role = 'user' ORDER BY m2.id DESC LIMIT 1) AS last_message,
      COUNT(*) AS message_count,
      MIN(created_at) AS started_at,
      MAX(created_at) AS last_at
    FROM messages m
    GROUP BY session_id
    ORDER BY MAX(created_at) DESC
  `);

  return result.rows.map(r => ({
    session_id: String((r as any).session_id),
    last_message: String((r as any).last_message ?? ''),
    message_count: Number((r as any).message_count),
    started_at: String((r as any).started_at),
    last_at: String((r as any).last_at),
  }));
}
