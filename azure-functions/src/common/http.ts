// Minimal HTTP client wrapper using native fetch (Node 18+).
// Kept separate so the webhook helper can focus on retry logic only.

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

/**
 * Performs an HTTP request with a configurable timeout.
 * Throws on network error or timeout — callers handle retries.
 */
export async function httpRequest(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };
  if (body !== undefined) {
    init.body = body;
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }

  const responseBody = await response.text();
  return {
    status: response.status,
    ok:     response.ok,
    body:   responseBody,
  };
}