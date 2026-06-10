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

### MCP-03 — `get_my_matches` ohne echte Pagination
Holt ALLE matches, filtert + sliced client-seitig in JS (tools.ts:60-65). Bei wachsender `tenant.matches` → unnötiger Payload.
Fix wenn relevant: `min_score`/`limit` als Query-Param an `/my/matches` reichen, Server-seitig filtern. Braucht Server-Support (tenant-Task).
**Entscheid 2026-06-10: bewusst defer.** Single-User, `tenant.matches` klein → kein Scale-Druck. Cross-Repo-Aufwand (tenant-module + MCP) lohnt jetzt nicht.

## Gated auf tenant-module Deploy (Florian-Schritt)

E2E-Smoke aller 4 Tools via Inspector — geht erst wenn tenant-module auf Coolify live. Heute lokal nur `get_my_matches` verifizierbar, die 3 neuen liefern 404 (erwartet). Schritte: README → "Lokal testen".

## Erledigt

- **MCP-01 — `tenant-mcp.mcpb` 0 bytes** (2026-06-10). Ursache: `mcpb pack` ohne `.mcpbignore` traversierte node_modules → Hang/leeres Artefakt. Fix: `.mcpbignore` (packt nur manifest + server/index.js + icon, esbuild `--bundle` macht server self-contained). `npm run validate`/`pack`-Scripts repariert (fehlendes manifest-Arg / stabiler Output-Name, dead `prepack:mcpb` entfernt). Pack jetzt 184 KB, 4 Files, exit 0.
- **MCP-02 — status-Description** (2026-06-10). Entscheid B: `z.string` bleibt (forward-kompatibel, Server alleinige Wahrheit), Description listet jetzt alle 6 `VALID_STATUSES` + 422-Hinweis (tools.ts). Kein `z.enum` → kein Repo-Drift-Risiko.
- **MCP-04 — README stale** (2026-06-10). Zeile umgeschrieben: Endpoints gebaut (bf02c18), prod-404 nur bis Deploy.
- ~~Hygiene: `dist-stage/` + `server/index.js` + `package-lock.json` committed~~ — alle in `.gitignore`, `git ls-files` trackt nur `src/`, manifest, README, icon, tsconfig. Sauber.
