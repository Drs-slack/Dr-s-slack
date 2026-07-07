// Tests the retry/timeout wrapper in isolation by stubbing global.fetch —
// no real network calls, no API key needed.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callOpenRouter, OpenRouterCallError } from '../src/openrouter-client.js';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('callOpenRouter', () => {
  test('returns parsed body on success', async () => {
    global.fetch = async () => jsonResponse(200, { choices: [{ message: { content: 'hi' } }] });
    const result = await callOpenRouter({
      apiKey: 'k', model: 'm', maxTokens: 10, messages: [],
    });
    assert.deepEqual(result, { choices: [{ message: { content: 'hi' } }] });
  });

  test('does not retry on 4xx — fails immediately', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return jsonResponse(400, { error: 'bad request' });
    };
    await assert.rejects(
      () => callOpenRouter({ apiKey: 'k', model: 'm', maxTokens: 10, messages: [] }),
      OpenRouterCallError
    );
    assert.equal(calls, 1);
  });

  test('retries once on 5xx, then succeeds', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (calls === 1) return jsonResponse(503, { error: 'overloaded' });
      return jsonResponse(200, { choices: [{ message: { content: 'ok on retry' } }] });
    };
    const result = await callOpenRouter({
      apiKey: 'k', model: 'm', maxTokens: 10, messages: [],
    });
    assert.equal(calls, 2);
    assert.equal(result.choices[0].message.content, 'ok on retry');
  });

  test('gives up after one retry if 5xx persists', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return jsonResponse(500, { error: 'still down' });
    };
    await assert.rejects(
      () => callOpenRouter({ apiKey: 'k', model: 'm', maxTokens: 10, messages: [] }),
      (err) => {
        assert.ok(err instanceof OpenRouterCallError);
        assert.equal(err.retryable, true);
        return true;
      }
    );
    assert.equal(calls, 2);
  });

  test('treats a network error as retryable and retries once', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (calls === 1) throw new Error('ECONNRESET');
      return jsonResponse(200, { choices: [{ message: { content: 'recovered' } }] });
    };
    const result = await callOpenRouter({
      apiKey: 'k', model: 'm', maxTokens: 10, messages: [],
    });
    assert.equal(calls, 2);
    assert.equal(result.choices[0].message.content, 'recovered');
  });

  test('times out slow calls and treats timeout as retryable', async () => {
    let calls = 0;
    global.fetch = async (_url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) => {
        // Never resolves on its own; only the abort signal ends it.
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };
    await assert.rejects(
      () => callOpenRouter({
        apiKey: 'k', model: 'm', maxTokens: 10, messages: [], timeoutMs: 20,
      }),
      (err) => {
        assert.ok(err instanceof OpenRouterCallError);
        assert.match(err.message, /timed out/);
        return true;
      }
    );
    assert.equal(calls, 2); // one attempt + one retry, both time out
  });
});
