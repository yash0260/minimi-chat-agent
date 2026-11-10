import { search, type Message } from './db.js';

export const FUNCTION_DECLARATIONS = [
  {
    name: 'recall_conversations',
    description:
      'Search past conversations with this user. Returns messages with timestamps. ' +
      'Use when the user asks about something they said before, a previous discussion, or a topic from a past date.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Keywords to search for in past messages',
        },
        date: {
          type: 'STRING',
          description: 'Specific date in YYYY-MM-DD format',
        },
        date_from: {
          type: 'STRING',
          description: 'Start of date range in YYYY-MM-DD format',
        },
        date_to: {
          type: 'STRING',
          description: 'End of date range in YYYY-MM-DD format',
        },
      },
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for current, up-to-date information. ' +
      'Use to verify whether a previous answer is still correct, check current prices, or look up recent facts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'recall_conversations':
      return recallConversations(input);
    case 'web_search':
      return webSearch(input as { query: string });
    default:
      return `Unknown tool: ${name}`;
  }
}

async function recallConversations(input: Record<string, unknown>): Promise<string> {
  const params: { query?: string; date?: string; dateFrom?: string; dateTo?: string } = {};
  if (typeof input.query === 'string') params.query = input.query;
  if (typeof input.date === 'string') params.date = input.date;
  if (typeof input.date_from === 'string') params.dateFrom = input.date_from;
  if (typeof input.date_to === 'string') params.dateTo = input.date_to;

  if (!params.query && !params.date && !params.dateFrom && !params.dateTo) {
    return 'No search parameters provided. Specify a date, date range, or keywords.';
  }

  const messages = await search(params);

  if (messages.length === 0) {
    return 'No past conversations found matching this search.';
  }

  return formatMessages(messages);
}

function formatMessages(messages: Message[]): string {
  const grouped = new Map<string, Message[]>();
  for (const m of messages) {
    if (!grouped.has(m.session_id)) grouped.set(m.session_id, []);
    grouped.get(m.session_id)!.push(m);
  }

  const parts: string[] = [];
  for (const [, msgs] of grouped) {
    const lines = msgs.map((m) => `  [${m.created_at}] ${m.role}: ${m.content}`);
    parts.push(lines.join('\n'));
  }

  return `Found ${messages.length} messages across ${grouped.size} conversation(s):\n\n${parts.join('\n---\n')}`;
}

async function webSearch(input: { query: string }): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return 'Web search is not configured. Set TAVILY_API_KEY to enable fact verification.';
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query,
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      return `Web search failed (${res.status}): ${res.statusText}`;
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: { title: string; url: string; content: string }[];
    };

    let output = '';
    if (data.answer) output += `Answer: ${data.answer}\n\n`;
    if (data.results?.length) {
      output += 'Sources:\n';
      for (const r of data.results.slice(0, 5)) {
        output += `- ${r.title}\n  ${r.content.slice(0, 300)}\n  ${r.url}\n\n`;
      }
    }

    return output || 'No results found.';
  } catch (err) {
    return `Web search error: ${err instanceof Error ? err.message : 'unknown'}`;
  }
}

export function toolStatusLabel(name: string): string {
  switch (name) {
    case 'recall_conversations':
      return 'Searching past conversations…';
    case 'web_search':
      return 'Searching the web…';
    default:
      return `Running ${name}…`;
  }
}
