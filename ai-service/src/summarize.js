import { callOpenRouter, OpenRouterCallError } from './openrouter-client.js';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

export async function summarize({ text }) {
  if (!API_KEY) {
    return {
      summary:
        'Document summarization is not configured. Set OPENROUTER_API_KEY in ai-service/.env to enable it.',
      degraded: true,
    };
  }

  let data;
  try {
    data = await callOpenRouter({
      apiKey: API_KEY,
      model: MODEL,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You summarize clinical documents for busy doctors. Return a 3–5 line ' +
            'digest highlighting: key findings, abnormal values, and any actions ' +
            'the document explicitly requests. Do not add treatment recommendations.',
        },
        { role: 'user', content: text },
      ],
    });
  } catch (err) {
    if (err instanceof OpenRouterCallError) {
      return {
        summary: err.retryable
          ? 'Summarization is temporarily unavailable. Please try again in a moment.'
          : 'This document could not be summarized.',
        degraded: true,
      };
    }
    throw err;
  }
  const summary = data.choices?.[0]?.message?.content || '';
  return { summary, degraded: false };
}
