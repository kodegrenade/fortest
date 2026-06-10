import { Router } from 'express';
import { ProxyRequestSchema, type ProxyResponse, type ApiError } from '@fortest/types';
import { ssrfProtection } from '../middleware/security';

const router: import('express').Router = Router();

router.post('/', ssrfProtection, async (req, res) => {
  // Validate request body
  const parsed = ProxyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const error: ApiError = {
      error: 'Validation Error',
      message: parsed.error.issues.map((i) => i.message).join(', '),
      statusCode: 400,
    };
    res.status(400).json(error);
    return;
  }

  const { method, url, headers, body, timeout } = parsed.data;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const startTime = performance.now();

    const fetchResponse = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
      redirect: 'follow',
    });

    const elapsed = performance.now() - startTime;
    clearTimeout(timeoutId);

    const responseBody = await fetchResponse.text();

    // Convert headers to a plain record
    const responseHeaders: Record<string, string> = {};
    fetchResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = responseHeaders['content-type'] ?? 'application/octet-stream';

    const proxyResponse: ProxyResponse = {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers: responseHeaders,
      body: responseBody,
      size: new TextEncoder().encode(responseBody).byteLength,
      time: Math.round(elapsed),
      contentType,
    };

    res.json(proxyResponse);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const error: ApiError = {
        error: 'Timeout',
        message: `Request timed out after ${timeout}ms`,
        statusCode: 504,
      };
      res.status(504).json(error);
      return;
    }

    if (err instanceof TypeError) {
      // fetch throws TypeError for network errors, invalid URLs, etc.
      const error: ApiError = {
        error: 'Network Error',
        message: err.message,
        statusCode: 502,
      };
      res.status(502).json(error);
      return;
    }

    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    const error: ApiError = {
      error: 'Proxy Error',
      message,
      statusCode: 500,
    };
    res.status(500).json(error);
  }
});

export default router;
