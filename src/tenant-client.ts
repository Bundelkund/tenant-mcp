/**
 * Thin HTTP client for the Tenant service (tenant.konektos.de, FastAPI).
 *
 * The MCP server is a pure proxy: it forwards the caller's X-API-Key and never
 * holds business logic. Tenant resolves the key -> profile_id and scopes every
 * row itself, so this client only needs to attach the header and map errors.
 *
 * Security: the API key is NEVER logged, never echoed into a tool result.
 */

import { z } from "zod";

const TIMEOUT_MS = 15_000;

/**
 * Das strukturierte `detail`, das der Tenant bei manchen Fehlern mitschickt.
 *
 * Der Anlass ist 409 `shrink_rejected` (PUT /my/search-terms): dort steht in
 * `removed`, welche Begriffe wegfielen — die Angabe, die aus einer Absage eine
 * beantwortbare Rueckfrage macht. Am I/O-Rand EINMAL geparst, damit niemand
 * weiter unten auf einem `unknown` herumraten muss.
 */
const FehlerDetail = z
  .object({
    error: z.string().optional(),
    message: z.string().optional(),
    kind: z.string().optional(),
    removed: z.array(z.string()).optional(),
    hint: z.string().optional(),
  })
  .passthrough();

export type TenantErrorDetail = z.infer<typeof FehlerDetail>;

export class TenantError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Geparstes `detail` der Antwort, sofern es ein Objekt war. */
    readonly detail?: TenantErrorDetail,
  ) {
    super(message);
    this.name = "TenantError";
  }
}

export interface TenantConfig {
  baseUrl: string;
  apiKey: string;
}

/** Resolve + validate config once at startup. Throws with a clear message so the
 *  host surfaces a useful error instead of a silent 401 storm. */
export function loadConfig(): TenantConfig {
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

  if (status === 409) return `Konflikt mit dem gespeicherten Stand${d}`;

  if (status >= 500) return `Tenant-Dienst-Fehler (${status})${d}`;

  return `Tenant-Antwort ${status}${d}`;
}

function isDetailRecord(value: unknown): value is { detail: unknown } {
  return typeof value === "object" && value !== null && "detail" in value;
}

function isPlainString(value: unknown): value is string {
  return typeof value === "string";
}

/** Ein strukturiertes `detail` in einen Satz verwandeln, den ein Mensch liest.
 *  Bevorzugt `message` (dort schreibt der Tenant Klartext); sonst kompaktes
 *  JSON — immer noch weit mehr als "[object Object]". */
function readableDetail(detail: TenantErrorDetail): string {
  if (detail.message !== undefined) return detail.message;

  return JSON.stringify(detail);
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
export async function tenantRequest<T = unknown>(cfg: TenantConfig, opts: RequestOpts): Promise<T> {
  const url = `${cfg.baseUrl}${opts.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp: Response;

  const headers: RequestInit["headers"] =
    opts.body !== undefined
      ? { "X-API-Key": cfg.apiKey, Accept: "application/json", "Content-Type": "application/json" }
      : { "X-API-Key": cfg.apiKey, Accept: "application/json" };

  try {
    resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
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
    // FastAPI liefert `detail` mal als Text, mal als Objekt (z.B. 409
    // shrink_rejected mit {error, message, kind, removed, hint}). Ein blindes
    // String() machte daraus "[object Object]" — die Meldung war formal da und
    // inhaltlich weg. Objekte werden deshalb hier EINMAL geparst: lesbar fuer
    // die Fehlermeldung, strukturiert fuer Aufrufer, die `removed` brauchen.
    const rohesDetail = isDetailRecord(parsed) ? parsed.detail : undefined;
    const strukturiert = FehlerDetail.safeParse(rohesDetail);

    const detail = isPlainString(rohesDetail)
      ? rohesDetail
      : strukturiert.success
        ? readableDetail(strukturiert.data)
        : isPlainString(parsed)
          ? parsed
          : undefined;

    throw new TenantError(
      describe(resp.status, detail),
      resp.status,
      strukturiert.success ? strukturiert.data : undefined,
    );
  }

  // SAFETY: Tenant is our own trusted backend; this client does not schema-validate
  // response bodies, so the caller-supplied T is trusted here, not verified.
  return parsed as T;
}
