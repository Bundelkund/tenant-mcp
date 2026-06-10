/**
 * Tool definitions. Every tool is a thin proxy onto one tenant endpoint.
 * No business logic here — tenant scopes everything by the resolved profile_id.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tenantRequest, TenantError, type loadConfig } from "./tenant-client.js";

type Cfg = ReturnType<typeof loadConfig>;
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  const msg = err instanceof TenantError ? err.message : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: msg }], isError: true };
}

interface MatchRow {
  profile_id: string;
  job_id: string;
  score: number;
  job_title: string;
  company: string;
  url: string;
  location?: string;
  first_seen_at?: string;
  last_seen_at?: string;
}

export function registerTools(server: McpServer, cfg: Cfg): void {
  // ── get_my_matches ──────────────────────────────────────────────────────
  server.registerTool(
    "get_my_matches",
    {
      title: "Meine Job-Matches",
      description:
        "Liefert deine persönliche, gescorte Job-Trefferliste (tenant.matches). " +
        "Jede Zeile: job_id, score, job_title, company, url, location. " +
        "Kein voller Stellentext — den holst du per get_job mit der job_id. " +
        "Standard: nach score absteigend sortiert.",
      inputSchema: {
        min_score: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Nur Matches mit score >= diesem Wert (z.B. 40 manuell, 75 auto)."),
        limit: z.number().int().min(1).max(200).optional().describe("Max. Anzahl Zeilen (Default 50)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ min_score, limit }) => {
      try {
        const data = await tenantRequest<{ matches: MatchRow[] }>(cfg, { path: "/my/matches" });
        let rows = Array.isArray(data?.matches) ? data.matches : [];
        if (typeof min_score === "number") rows = rows.filter((r) => Number(r.score) >= min_score);
        rows.sort((a, b) => Number(b.score) - Number(a.score));
        if (typeof limit === "number") rows = rows.slice(0, limit);
        else rows = rows.slice(0, 50);
        return ok({ count: rows.length, matches: rows });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── get_job ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_job",
    {
      title: "Stellentext",
      description:
        "Voller Stellentext (description) zu einer job_id aus get_my_matches. " +
        "Pflicht-Input fürs Anschreiben — die Match-Liste enthält nur Metadaten.",
      inputSchema: {
        job_id: z.string().min(1).describe("job_id aus get_my_matches."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ job_id }) => {
      try {
        const data = await tenantRequest(cfg, { path: `/my/job/${encodeURIComponent(job_id)}` });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── get_my_profile ──────────────────────────────────────────────────────
  server.registerTool(
    "get_my_profile",
    {
      title: "Mein Bewerbungs-Profil",
      description:
        "Dein Bewerbungs-Profil (positioning, cv-text, achievements, skills-matrix, writing-style). " +
        "Datenquelle für Anschreiben + CV-Anpassung.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await tenantRequest(cfg, { path: "/my/profile" });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── save_application ────────────────────────────────────────────────────
  server.registerTool(
    "save_application",
    {
      title: "Bewerbung tracken",
      description:
        "Speichert/aktualisiert eine erstellte Bewerbung im persönlichen Tracker. " +
        "Schreib-Operation — nur nach Erstellung von Anschreiben + CV aufrufen.",
      inputSchema: {
        job_id: z.string().min(1).describe("job_id der Bewerbung."),
        status: z
          .string()
          .min(1)
          .describe(
            "Bewerbungs-Status. Erlaubt: 'drafted', 'applied', 'interview', " +
              "'offer', 'rejected', 'paused'. Server validiert — anderer Wert → 422.",
          ),
        company: z.string().optional().describe("Firmenname (Dedup/Anzeige)."),
        role: z.string().optional().describe("Rollen-/Stellentitel."),
        notes: z.string().optional().describe("Freitext-Notiz (optional)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ job_id, status, company, role, notes }) => {
      try {
        const data = await tenantRequest(cfg, {
          method: "POST",
          path: "/my/applications",
          body: { job_id, status, company, role, notes },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
