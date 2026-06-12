const RETRYABLE_STATUS = new Set([429]);

export function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

function getRetryAfterMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export async function withRetry(
  operation,
  {
    maxAttempts = 5,
    baseDelayMs = 1000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRetry,
  } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation(attempt);
      if (result instanceof Response && isRetryableStatus(result.status)) {
        const error = new Error(`Retryable HTTP status ${result.status}`);
        error.response = result;
        throw error;
      }
      return result;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retryable = status == null || isRetryableStatus(status);
      if (!retryable || attempt === maxAttempts) throw error;

      const retryAfterMs = getRetryAfterMs(error.response);
      const delayMs = retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function fetchJsonWithRetry(
  url,
  options = {},
  {
    fetchImpl = fetch,
    logger,
    operation = "HTTP request",
    timeoutMs = 60_000,
    maxAttempts = 5,
    baseDelayMs = 1000,
  } = {},
) {
  const response = await withRetry(
    async (attempt) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const externalSignal = options.signal;
      const abortFromExternal = () =>
        controller.abort(externalSignal.reason);
      if (externalSignal?.aborted) {
        abortFromExternal();
      } else {
        externalSignal?.addEventListener("abort", abortFromExternal, {
          once: true,
        });
      }

      try {
        const currentResponse = await fetchImpl(url, {
          ...options,
          signal: controller.signal,
        });
        if (isRetryableStatus(currentResponse.status)) {
          const error = new Error(
            `${operation} failed with HTTP ${currentResponse.status}`,
          );
          error.response = currentResponse;
          throw error;
        }
        return currentResponse;
      } catch (error) {
        if (controller.signal.aborted && !externalSignal?.aborted) {
          throw new Error(
            `${operation} timed out after ${timeoutMs}ms (attempt ${attempt})`,
            { cause: error },
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
      }
    },
    {
      maxAttempts,
      baseDelayMs,
      onRetry: ({ attempt, delayMs, error }) => {
        logger?.warn(
          { operation, attempt, delay_ms: delayMs, error: error.message },
          "Retrying request",
        );
      },
    },
  );

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${operation} returned invalid JSON (HTTP ${response.status})`);
    }
  }

  if (!response.ok) {
    const error = new Error(
      `${operation} failed with HTTP ${response.status}: ${body?.msg || body?.message || text}`,
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}
