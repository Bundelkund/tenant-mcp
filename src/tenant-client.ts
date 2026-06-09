/**
 * Thin HTTP client for the Tenant service (tenant.konektos.de, FastAPI).
 *
 * The MCP server is a pure proxy: it forwards the caller's X-API-Key and never
 * holds business logic. Tenant resolves the key -> profile_id and scopes every
 * row itself, so this client only needs to attach the header and map errors.
 *
 * Security: the API key is NEVER logged, never echoed into a tool result.
 */

const TIMEOUT_MS = 15_000;

export class TenantError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TenantError";
  }
}

/** Resolve + validate config once at startup. Throws with a clear message so the
 *  host surfaces a useful error instead of a silent 401 storm. */
export function loadConfig(): { baseUrl: string; apiKey: string } {
  const apiKey = (process.env.TENANT_API_KEY ?? "").trim();
  let baseUrl = (process.env.TENANT_URL ?? "https://tenant.konektos.de").trim();

  if (!apiKey) {
    throw new Error(
      "TENANT_API_KEY fehlt. Trage deinen persönlichen API-Key im Install-Dialog ein.",
    );
  }
  baseUrl = baseUrl.replace(/\/+$/, "");
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
  if (!baseUrl.startsWith("https://") && !isLocalhost) {
    throw new Error(`TENANT_URL muss HTTPS sein (oder localhost): ${baseUrl}`);
  }
  return { baseUrl, apiKey };
}

/** Map an HTTP status + tenant `detail` to a human-readable message. Keeps the
 *  raw key out of any output. */
function describe(status: number, detail: string | undefined): string {
  const d = detail ? ` (${detail})` : "";
  if (status === 401) return `Authentifizierung fehlgeschlagen — API-Key ungültig oder fehlt${d}`;
  if (status === 404) return `Nicht gefunden${d}`;
  if (status >= 500) return `Tenant-Dienst-Fehler (${status})${d}`;
  return `Tenant-Antwort ${status}${d}`;
}

type RequestOpts = {
  method?: "GET" | "POST" | "PUT";
  /** path starting with "/", e.g. "/my/matches" */
  path: string;
  body?: unknown;
};

/**
 * Perform one tenant request. Returns parsed JSON on 2xx, throws TenantError
 * otherwise. Never includes the API key in thrown messages.
 */
export async function tenantRequest<T = unknown>(
  cfg: { baseUrl: string; apiKey: string },
  opts: RequestOpts,
): Promise<T> {
  const url = `${cfg.baseUrl}${opts.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "X-API-Key": cfg.apiKey,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TenantError(`Zeitüberschreitung nach ${TIMEOUT_MS / 1000}s — Tenant nicht erreichbar`, 0);
    }
    throw new TenantError(`Netzwerkfehler — Tenant nicht erreichbar`, 0);
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON body — keep raw text for error context only
    }
  }

  if (!resp.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : typeof parsed === "string"
          ? parsed
          : undefined;
    throw new TenantError(describe(resp.status, detail), resp.status);
  }

  return parsed as T;
}
