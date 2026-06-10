# tenant-mcp — Backlog

> Folge-Tasks aus dem apply-via-MCP-Build (tenant-module commit `bf02c18`).
> MCP = reiner Proxy; Contract liegt server-seitig in tenant-module/`app/routes/my.py`.
> Stand 2026-06-10.

## Contract-Status (gegen tenant-module)

Die 4 Tools nageln den Wire-Contract fest. Server-Endpoints jetzt gebaut (noch nicht deployed):

| Tool | Endpoint | Server-Stand |
|------|----------|--------------|
| `get_my_matches` | `GET /my/matches` | live |
| `get_job` | `GET /my/job/{id}` | gebaut — Server whitelist-filtert intern (metadata/content_hash/external_id raus), MCP reicht roh durch ✓ |
| `get_my_profile` | `GET /my/profile` | gebaut — 5 Felder positioning/cv_text/achievements/skills_matrix/writing_style |
| `save_application` | `POST /my/applications` | gebaut — Event-Log append-only; Server normalisiert `status` + 422 bei invalid |

`save_application`-Body `{job_id, status, company, role, notes}` (tools.ts:142) trifft `ApplicationBody`. MCP sendet kein `url` (Server-optional) → ok.

## Offen

### MCP-01 — `tenant-mcp.mcpb` ist 0 bytes
`npm run pack` nie sauber durchgelaufen → leeres Artefakt (`.mcpb` gitignored). Ohne valides Pack kein Desktop-Install.
Fix: `npm run build && npm run validate && npm run pack`, Größe prüfen (>0, manifest+server/index.js drin).

### MCP-02 — `save_application` status ohne client-Enum
`status: z.string().min(1)` (tools.ts:128) = Freitext. Server fängt invalid mit 422 → korrekt, aber LLM lernt erlaubte Werte erst aus Fehler.
Optional: `z.enum(["drafted","applied","interview","offer","rejected","paused"])` → schärfere Tool-Description, weniger 422-Roundtrips. Vokabular = Server-`VALID_STATUSES` (single source).

### MCP-03 — `get_my_matches` ohne echte Pagination
Holt ALLE matches, filtert + sliced client-seitig in JS (tools.ts:60-65). Bei wachsender `tenant.matches` → unnötiger Payload.
Fix wenn relevant: `min_score`/`limit` als Query-Param an `/my/matches` reichen, Server-seitig filtern. Braucht Server-Support (tenant-Task).

### MCP-04 — README:14 stale
Behauptet `get_job`/`get_my_profile`/`save_application` liefern "Tenant-404 bis Endpoints stehen". Endpoints jetzt gebaut → 404 nur noch bis tenant-module deployed. Nach Deploy: Zeile streichen, "live" markieren.

## Erledigt

- ~~Hygiene: `dist-stage/` + `server/index.js` + `package-lock.json` committed~~ — alle in `.gitignore`, `git ls-files` trackt nur `src/`, manifest, README, icon, tsconfig. Sauber.
