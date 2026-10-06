import type { IncomingHttpHeaders } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@fortest/types';

// Fortest is a local tool. Binding to 127.0.0.1 keeps other machines out; this check keeps
// out web pages in the user's own browser: DNS rebinding (foreign Host) and cross-site
// requests/WebSockets (foreign Origin). Add auth before ever exposing this beyond localhost.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalRequest(headers: IncomingHttpHeaders): boolean {
  try {
    if (!LOCAL_HOSTNAMES.has(new URL(`http://${headers.host}`).hostname)) return false;
    return !headers.origin || LOCAL_HOSTNAMES.has(new URL(headers.origin).hostname);
  } catch {
    return false;
  }
}

export function localOnly(req: Request, res: Response, next: NextFunction): void {
  if (isLocalRequest(req.headers)) return next();
  const error: ApiError = {
    error: 'Forbidden',
    message: 'Fortest only accepts requests from localhost',
    statusCode: 403,
  };
  res.status(403).json(error);
}
