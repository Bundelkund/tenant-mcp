# tenant-mcp

Dünner MCP-Server (MCPB) der den persönlichen **Tenant**-Dienst (`tenant.konektos.de`) für **Claude Desktop** zugänglich macht. Reiner Proxy — keine Geschäftslogik; Tenant scoped alles über den persönlichen `X-API-Key` → `profile_id`.

## Tools

| Tool | Tenant-Endpoint | Zweck |
|------|-----------------|-------|
| `get_my_matches` | `GET /my/matches` | Gescorte Job-Trefferliste (Metadaten) |
| `get_job` | `GET /my/job/{job_id}` | Voller Stellentext |
| `get_my_profile` | `GET /my/profile` | Bewerbungs-Profil (Schreib-Quelle) |
| `save_application` | `POST /my/applications` | Bewerbung tracken |

> Alle 4 Endpoints sind im Tenant **gebaut** (tenant-module commit `bf02c18`). `get_my_matches` ist prod-live; `get_job` / `get_my_profile` / `save_application` liefern prod-404 nur bis tenant-module deployed ist — danach live ohne MCP-Code-Change.

## Build

```bash
npm install
npm run build          # esbuild -> server/index.js
npm run validate       # mcpb validate (manifest)
npm run pack           # -> tenant-mcp.mcpb
```

## Lokal testen (Inspector)

```bash
TENANT_URL=https://tenant.konektos.de TENANT_API_KEY=<dein-key> \
  npx @modelcontextprotocol/inspector node server/index.js
```

`get_my_matches` aufrufen → erwarte `{ count, matches:[...] }`. Falscher Key → sauberer `isError` (401), Key nie im Output.

## Install (Desktop)

`tenant-mcp.mcpb` auf Claude Desktop ziehen → API-Key im Dialog eintragen (sensitive → Keychain). Tenant-URL Standard belassen.

## Auth

`X-API-Key` aus `user_config.apiKey` → `env.TENANT_API_KEY` → Header an Tenant. Kein OAuth (Desktop-lokal). Kein Token-Passthrough an Dritte.
