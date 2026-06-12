import test from "node:test";
import assert from "node:assert/strict";

import { fetchJsonWithRetry } from "../utils/retry.js";

test("HTTP timeout is bounded and retried", async () => {
  let attempts = 0;
  const fetchImpl = async (_url, options) => {
    attempts += 1;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  };

  await assert.rejects(
    fetchJsonWithRetry(
      "https://example.test",
      {},
      {
        fetchImpl,
        operation: "Test request",
        timeoutMs: 5,
        maxAttempts: 2,
        baseDelayMs: 1,
      },
    ),
    /timed out after 5ms \(attempt 2\)/,
  );
  assert.equal(attempts, 2);
});
