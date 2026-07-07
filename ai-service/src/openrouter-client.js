// Shared helper for calling the OpenRouter chat/completions API from ask.js
// and summarize.js. Centralized here so both endpoints get identical, tested
// timeout/retry behavior instead of copy-pasted fetch logic.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Thrown when the OpenRouter call fails after retrying. Callers can check
 * `.retryable` to decide whether to surface a "try again" message. */
export class OpenRouterCallError extends Error {
  constructor(message, { status, retryable } = {}) {
    super(message);
    this.name = 'OpenRouterCallError';
    this.status = status;
    this.retryable = Boolean(retryable);
  }
}

async function callOnce(apiKey, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the OpenRouter chat/completions API with a timeout and a single
 * retry on 5xx responses or network/timeout errors. 4xx errors (bad request,
 * auth, rate limit) are not retried — retrying a malformed request just
 * wastes the timeout budget twice.
 *
 * @returns {Promise<{choices: Array}>} the parsed response body
 */
export async function callOpenRouter({
  apiKey,
  model,
  maxTokens,
  messages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const body = { model, max_tokens: maxTokens, messages };

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await callOnce(apiKey, body, timeoutMs);

      if (res.ok) {
        return res.json();
      }

      const text = await res.text();
      const retryable = res.status >= 500;
      lastErr = new OpenRouterCallError(
        `OpenRouter API returned ${res.status}: ${text}`,
        { status: res.status, retryable }
      );
      if (!retryable) throw lastErr; // 4xx: fail fast, don't retry
      // 5xx: fall through and retry once.
    } catch (err) {
      if (err instanceof OpenRouterCallError) throw err;
      // Network error or abort (timeout) — treat as retryable.
      const isTimeout = err.name === 'AbortError';
      lastErr = new OpenRouterCallError(
        isTimeout
          ? `OpenRouter API call timed out after ${timeoutMs}ms`
          : `OpenRouter API call failed: ${err.message}`,
        { retryable: true }
      );
    }
  }
  throw lastErr;
}
