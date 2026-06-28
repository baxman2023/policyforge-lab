const API_PREFIX = "/api";
const PHP_PROXY_PREFIX = "/index.php";

declare global {
  interface Window {
    __forgeScriptLabApiProxyInstalled?: boolean;
  }
}

export function apiPath(path: string) {
  if (!usesCloudwaysPhpProxy() || !isApiPath(path)) {
    return path;
  }
  return path.startsWith(`${PHP_PROXY_PREFIX}${API_PREFIX}`) ? path : `${PHP_PROXY_PREFIX}${path}`;
}

export function installApiFetchProxy() {
  if (typeof window === "undefined" || window.__forgeScriptLabApiProxyInstalled || !usesCloudwaysPhpProxy()) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => originalFetch(rewriteFetchInput(input), init);
  window.__forgeScriptLabApiProxyInstalled = true;
}

function rewriteFetchInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string") {
    return rewriteApiUrl(input);
  }
  if (input instanceof URL) {
    return new URL(rewriteApiUrl(input.toString()));
  }
  if (input instanceof Request) {
    const rewritten = rewriteApiUrl(input.url);
    return rewritten === input.url ? input : new Request(rewritten, input);
  }
  return input;
}

function rewriteApiUrl(value: string) {
  if (!usesCloudwaysPhpProxy()) {
    return value;
  }

  if (isApiPath(value)) {
    return apiPath(value);
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && isApiPath(url.pathname)) {
      url.pathname = apiPath(url.pathname);
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}

function isApiPath(path: string) {
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`) || path.startsWith(`${API_PREFIX}?`);
}

function usesCloudwaysPhpProxy() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return (
    window.location.pathname.startsWith(PHP_PROXY_PREFIX) ||
    hostname === "forgescriptlab.com" ||
    hostname === "www.forgescriptlab.com" ||
    hostname.endsWith(".cloudwaysapps.com")
  );
}
