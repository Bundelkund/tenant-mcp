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
        "Pflicht-Input fürs Anschreiben — die Match-Liste enthält nur Metadaten. " +
        "Trägt die Antwort das Feld degraded, war die Stellen-Datenbank nicht " +
        "erreichbar: dann gibt es NUR Titel/Firma/Ort/Link und description ist null. " +
        "In dem Fall kein Anschreiben schreiben, sondern sagen, dass der Stellentext " +
        "fehlt — ein Anschreiben ohne Stellentext ist geraten.",
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

  // ── set_my_profile ──────────────────────────────────────────────────────
  server.registerTool(
    "set_my_profile",
    {
      title: "Mein Bewerbungs-Profil schreiben",
      description:
        "Schreibt/aktualisiert dein Bewerbungs-Profil (positioning, cv_text, " +
        "achievements, skills_matrix, writing_style) — die Datenquelle, die " +
        "get_my_profile liefert und die apply/rank lesen. Partial-Update: nur " +
        "übergebene Felder werden geschrieben, die anderen bleiben unverändert. " +
        "Onboarding-Ziel für den letter-forge-Fragebogen. Nur auf den eigenen " +
        "API-Key gescoped.",
      inputSchema: {
        positioning: z.string().optional().describe("Kern-Positionierung (1-2 Absätze)."),
        cv_text: z.string().optional().describe("CV als Markdown/Freitext."),
        achievements: z.string().optional().describe("Quantifizierte Erfolge."),
        skills_matrix: z.string().optional().describe("Skills mit Evidenz."),
        writing_style: z.string().optional().describe("Ton/Schreibstil-Regeln."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ positioning, cv_text, achievements, skills_matrix, writing_style }) => {
      try {
        // Only forward fields the caller actually set → server does exclude_unset,
        // so a one-field edit never clobbers the other four with null.
        const body: Record<string, string> = {};
        if (positioning !== undefined) body.positioning = positioning;
        if (cv_text !== undefined) body.cv_text = cv_text;
        if (achievements !== undefined) body.achievements = achievements;
        if (skills_matrix !== undefined) body.skills_matrix = skills_matrix;
        if (writing_style !== undefined) body.writing_style = writing_style;
        const data = await tenantRequest(cfg, { method: "PUT", path: "/my/profile", body });
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
        "Schreib-Operation — nur nach Erstellung von Anschreiben + CV aufrufen. " +
        "Die Antwort trägt effective: steht dort false, wurde das Ereignis zwar " +
        "gespeichert, ändert aber den angezeigten Stand NICHT (ein älteres Datum " +
        "liegt hinter einem neueren Eintrag). displayed_status nennt dann, was " +
        "stattdessen gilt. Gespeichert ist nicht gleich sichtbar — nicht ungeprüft " +
        "Erfolg melden.",
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

  // ── save_interview ───────────────────────────────────────────────────────
  server.registerTool(
    "save_interview",
    {
      title: "Interview-Runde speichern",
      description:
        "Speichert/aktualisiert eine Interview-Runde für eine Stelle. Schreib-Operation, " +
        "keyed auf (job_id, stage) — ein zweiter Aufruf mit derselben stage schreibt in " +
        "dieselbe Zeile weiter (z.B. erst prep_notes VOR dem Termin, dann debrief_notes " +
        "DANACH), ohne bereits gesetzte Felder zu löschen. Nur mitgeschickte Felder werden " +
        "geändert. Andere stage (z.B. 'onsite' statt 'screening') → eigene, neue Zeile.",
      inputSchema: {
        job_id: z.string().min(1).describe("job_id der Stelle, zu der die Runde gehört."),
        stage: z
          .string()
          .min(1)
          .describe(
            "Freitext-Bezeichnung der Runde, z.B. 'screening', 'technical', 'onsite', " +
              "'final'. Identifiziert zusammen mit job_id die Zeile — zweiter Aufruf mit " +
              "gleicher stage aktualisiert statt eine neue Runde anzulegen.",
          ),
        company: z.string().optional().describe("Firmenname."),
        role: z.string().optional().describe("Rollen-/Stellentitel."),
        scheduled_at: z.string().optional().describe("ISO-8601-Zeitpunkt des Termins, falls bekannt."),
        prep_notes: z.string().optional().describe("Vorbereitungsnotizen, vor dem Termin geschrieben."),
        debrief_notes: z.string().optional().describe("Nachbereitungsnotizen, nach dem Termin geschrieben."),
        outcome: z.string().optional().describe("Freitext-Ergebnis der Runde, z.B. 'weiter zur nächsten Runde', 'abgesagt'."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ job_id, stage, company, role, scheduled_at, prep_notes, debrief_notes, outcome }) => {
      try {
        const data = await tenantRequest(cfg, {
          method: "POST",
          path: "/my/interviews",
          body: { job_id, stage, company, role, scheduled_at, prep_notes, debrief_notes, outcome },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── get_my_interviews ────────────────────────────────────────────────────
  server.registerTool(
    "get_my_interviews",
    {
      title: "Meine Interview-Runden",
      description:
        "Liefert deine gespeicherten Interview-Runden, neueste zuerst. Optional auf eine " +
        "job_id gefiltert — z.B. um vor einem debrief-Aufruf die passende stage einer " +
        "Runde zu finden.",
      inputSchema: {
        job_id: z.string().optional().describe("Nur Runden dieser Stelle liefern."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ job_id }) => {
      try {
        const path = job_id ? `/my/interviews?job_id=${encodeURIComponent(job_id)}` : "/my/interviews";
        const data = await tenantRequest(cfg, { path });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
