import { promises as dns } from 'node:dns';
import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@fortest/types';

// Private/reserved IP ranges that should be blocked
const BLOCKED_IP_RANGES = [
  { prefix: '127.', description: '127.0.0.0/8 (loopback)' },
  { prefix: '10.', description: '10.0.0.0/8 (private)' },
  { prefix: '0.', description: '0.0.0.0/8 (unspecified)' },
  { prefix: '169.254.', description: '169.254.0.0/16 (link-local)' },
];

// 172.16.0.0/12 covers 172.16.x.x through 172.31.x.x
function isPrivate172(ip: string): boolean {
  if (!ip.startsWith('172.')) return false;
  const secondOctet = parseInt(ip.split('.')[1] ?? '', 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

// 192.168.0.0/16
function isPrivate192(ip: string): boolean {
  return ip.startsWith('192.168.');
}

const BLOCKED_EXACT = new Set(['0.0.0.0', '::1', '::']);

function isBlockedIp(ip: string): boolean {
  if (BLOCKED_EXACT.has(ip)) return true;
  if (BLOCKED_IP_RANGES.some((range) => ip.startsWith(range.prefix))) return true;
  if (isPrivate172(ip)) return true;
  if (isPrivate192(ip)) return true;
  // IPv6 loopback/mapped addresses
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    return isBlockedIp(mapped);
  }
  return false;
}

export async function validateTargetUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname;

  // Block if hostname is an IP literal
  if (isBlockedIp(hostname)) return false;

  // Resolve hostname to check the actual IPs
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.some(isBlockedIp)) return false;
  } catch {
    // If DNS resolution fails for IPv4, try IPv6
    try {
      const addresses = await dns.resolve6(hostname);
      if (addresses.some(isBlockedIp)) return false;
    } catch {
      // DNS resolution failed entirely — allow the request through
      // and let the fetch call handle the error naturally
    }
  }

  return true;
}

export function ssrfProtection(req: Request, res: Response, next: NextFunction): void {
  const url = (req.body as Record<string, unknown>)?.url;

  if (typeof url !== 'string') {
    const error: ApiError = {
      error: 'Bad Request',
      message: 'Missing or invalid URL',
      statusCode: 400,
    };
    res.status(400).json(error);
    return;
  }

  validateTargetUrl(url)
    .then((isValid) => {
      if (!isValid) {
        const error: ApiError = {
          error: 'Forbidden',
          message: 'Requests to private/internal network addresses are not allowed',
          statusCode: 403,
        };
        res.status(403).json(error);
        return;
      }
      next();
    })
    .catch(next);
}
