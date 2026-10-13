const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid"
]);

export function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    [...url.searchParams.keys()].forEach((key) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.startsWith("utm_") || trackingParameters.has(normalizedKey)) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function hostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function hostMatches(host: string, allowedHosts: Iterable<string>): boolean {
  const normalizedHost = host.toLowerCase();
  return [...allowedHosts].some((allowedHost) => {
    const normalizedAllowed = allowedHost.trim().toLowerCase();
    return normalizedAllowed.length > 0
      && (normalizedHost === normalizedAllowed || normalizedHost.endsWith(`.${normalizedAllowed}`));
  });
}
