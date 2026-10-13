const defaultMinimumIntervalMs = 1_000;
const maximumConfiguredIntervalMs = 60_000;
const originMinimumIntervalsMs = new Map([
  ["https://arxiv.org", 15_000],
  // Microsoft DevBlogs robots.txt 指定 Crawl-delay: 10，所有同來源請求均遵守此下限。
  ["https://devblogs.microsoft.com", 10_000],
  // iThome robots.txt 指定 Crawl-delay: 10，所有同來源請求均遵守此下限。
  ["https://www.ithome.com.tw", 10_000]
]);

export const sourceCrawlerProduct = "AI-News-Line-Bot";
export const sourceUserAgent = process.env.SOURCE_USER_AGENT?.trim()
  || `${sourceCrawlerProduct}/0.4 (personal digest; configure SOURCE_USER_AGENT with a contact URL)`;

interface SourceHttpClientOptions {
  minimumIntervalMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function configuredMinimumInterval(): number {
  const rawValue = process.env.SOURCE_MIN_INTERVAL_MS?.trim();
  if (!rawValue) return process.env.NODE_ENV === "test" ? 0 : defaultMinimumIntervalMs;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > maximumConfiguredIntervalMs) {
    throw new Error(
      `SOURCE_MIN_INTERVAL_MS must be between 0 and ${maximumConfiguredIntervalMs}`
    );
  }
  return value;
}

function retryAfterMilliseconds(response: Response, now: number): number | null {
  if (response.status !== 429 && response.status !== 503) return null;
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export class SourceHttpClient {
  private readonly minimumIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly nextAllowedAt = new Map<string, number>();

  constructor(options: SourceHttpClientOptions = {}) {
    this.minimumIntervalMs = options.minimumIntervalMs ?? configuredMinimumInterval();
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep
      ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const target = new URL(url);
    const previous = this.queues.get(target.origin) ?? Promise.resolve();
    let resolveQueue!: () => void;
    const queue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });
    this.queues.set(target.origin, queue);

    await previous.catch(() => undefined);
    try {
      const waitMs = Math.max(0, (this.nextAllowedAt.get(target.origin) ?? 0) - this.now());
      if (waitMs > 0) await this.sleep(waitMs);

      const headers = new Headers(init.headers);
      if (!headers.has("User-Agent")) headers.set("User-Agent", sourceUserAgent);
      const response = await this.fetchImpl(target, { ...init, headers });
      const retryDelay = retryAfterMilliseconds(response, this.now()) ?? 0;
      const originMinimumInterval = originMinimumIntervalsMs.get(target.origin) ?? 0;
      this.nextAllowedAt.set(
        target.origin,
        this.now() + Math.max(this.minimumIntervalMs, originMinimumInterval, retryDelay)
      );
      return response;
    } finally {
      resolveQueue();
      if (this.queues.get(target.origin) === queue) this.queues.delete(target.origin);
    }
  }
}

export const sourceHttpClient = new SourceHttpClient();
