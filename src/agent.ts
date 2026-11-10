import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { getRecentMessages, saveMessage } from './db.js';
import { FUNCTION_DECLARATIONS, executeTool, toolStatusLabel } from './tools.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL_NAME = process.env.MODEL || 'gemini-3.5-flash';
const MAX_ROUNDS = 6;

function systemPrompt(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return [
    'You are a helpful assistant with persistent memory of every past conversation with this user.',
    `Today is ${date}, ${time}.`,
    '',
    'You have two tools:',
    '• recall_conversations – search past conversations by date and/or keywords. ALWAYS call this when the user references something they asked before. Never guess from memory.',
    '• web_search – search the web for current information. Use this to verify facts, check current pricing, or answer questions about the state of the world right now.',
    '',
    'When the user asks whether a previous answer is still correct:',
    '1. recall_conversations to find the original exchange',
    '2. web_search to check the current facts',
    '3. Compare and give a clear, honest answer',
    '',
    'Be concise and direct. Give the answer, not a description of your process.',
    'If you cannot find a past conversation, say so honestly.',
    'If web search is unavailable, note that you cannot verify live data.',
  ].join('\n');
}

export interface AgentEvent {
  type: 'status' | 'text' | 'done' | 'error';
  content?: string;
}

export async function* chat(sessionId: string, userMessage: string): AsyncGenerator<AgentEvent> {
  const history = await getRecentMessages(sessionId);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt(),
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }],
  });

  const geminiHistory: { role: 'user' | 'model'; parts: Part[] }[] = history.map((m) => ({
    role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
    parts: [{ text: m.content }],
  }));

  const session = model.startChat({ history: geminiHistory });

  let rounds = 0;
  let nextMessage: string | Part[] = userMessage;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    let result;
    try {
      result = await session.sendMessage(nextMessage);
    } catch (err) {
      yield { type: 'error', content: err instanceof Error ? err.message : 'Gemini API error' };
      return;
    }

    const calls = result.response.functionCalls();

    if (!calls || calls.length === 0) {
      let text: string;
      try {
        text = result.response.text();
      } catch {
        text = '(The model returned an empty response.)';
      }

      saveMessage(sessionId, 'user', userMessage);
      saveMessage(sessionId, 'assistant', text);

      yield { type: 'text', content: text };
      yield { type: 'done' };
      return;
    }

    const responseParts: Part[] = [];

    for (const call of calls) {
      yield { type: 'status', content: toolStatusLabel(call.name) };

      try {
        const output = await executeTool(call.name, (call.args ?? {}) as Record<string, unknown>);
        responseParts.push({
          functionResponse: { name: call.name, response: { content: output } },
        });
      } catch (err) {
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: err instanceof Error ? err.message : 'unknown' },
          },
        });
      }
    }

    nextMessage = responseParts;
  }

  yield { type: 'error', content: 'Exceeded maximum reasoning steps.' };
}
