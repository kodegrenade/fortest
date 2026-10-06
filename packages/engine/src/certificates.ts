import tls from 'node:tls';

// Newer than this repo's @types/node; feature-detected below.
const nodeTls = tls as typeof tls & {
  getCACertificates?: (type: 'default' | 'system') => string[];
  setDefaultCACertificates?: (certs: string[]) => void;
};

// Node ships its own CA list and ignores the operating system's trust store, so HTTPS fails
// (SELF_SIGNED_CERT_IN_CHAIN) behind proxies that inspect HTTPS (Netskope, Zscaler, ...), whose
// root certificate is installed in the OS but not in Node. curl and browsers use the OS store.
let trusted = false;

/**
 * Trusts the OS's certificates as well as Node's own. Call once at startup, before any request.
 * Needs Node 22.19+/24.5+; on older versions it does nothing (NODE_EXTRA_CA_CERTS still works there).
 */
export function trustSystemCertificates(): void {
  const { getCACertificates, setDefaultCACertificates } = nodeTls;
  if (trusted || !getCACertificates || !setDefaultCACertificates) return;
  trusted = true;
  try {
    setDefaultCACertificates([...getCACertificates('default'), ...getCACertificates('system')]);
  } catch {
    // An unreadable OS store leaves Node's defaults in place, as before.
  }
}

const CERTIFICATE_ERRORS = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/**
 * Why a request got no response, in words. fetch only says "fetch failed"; the reason is in
 * err.cause (DNS, refused connection, untrusted certificate, ...).
 */
export function describeRequestError(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown network or execution error';
  if (err.name === 'TimeoutError') return 'The request timed out';
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const code = cause?.code;
  if (!code) return cause?.message ? `${err.message}: ${cause.message}` : err.message;
  if (CERTIFICATE_ERRORS.has(code)) {
    return (
      `HTTPS certificate not trusted (${code}): ${cause.message}. If a proxy on your network inspects HTTPS ` +
      `(e.g. Netskope, Zscaler), set NODE_EXTRA_CA_CERTS to its root certificate, or use Node 22.19+/24.5+ ` +
      `so Fortest can use the system's certificates.`
    );
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Could not resolve the host (${code}): check the URL and your connection`;
  if (code === 'ECONNREFUSED') return `Connection refused (${code}): nothing is listening at that address`;
  if (code === 'ECONNRESET') return `The connection was reset (${code})`;
  return `${cause.message ?? err.message} (${code})`;
}
