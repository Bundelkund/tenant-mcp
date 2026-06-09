#!/usr/bin/env node
/**
 * tenant-mcp — MCPB stdio entry point.
 *
 * Thin proxy that exposes the personal Tenant service (job matches, job detail,
 * profile, application tracking) to Claude Desktop. Auth is the caller's
 * X-API-Key, injected by the host from user_config -> env (see manifest.json).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./tenant-client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  // Fail fast with a clear message if config is missing/invalid.
  const cfg = loadConfig();

  const server = new McpServer(
    { name: "tenant-mcp", version: "0.1.0" },
    {
      instructions:
        "Persönlicher Job-/Bewerbungs-Zugang. Reihenfolge: get_my_matches " +
        "(Trefferliste) → get_job(job_id) für den vollen Stellentext → " +
        "get_my_profile als Schreib-Quelle. save_application erst nach fertiger " +
        "Bewerbung. Jeder Aufruf ist auf den eigenen API-Key gescoped.",
    },
  );

  registerTools(server, cfg);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // stderr only — stdout is the MCP stdio channel and must stay protocol-clean.
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[tenant-mcp] Start fehlgeschlagen: ${msg}\n`);
  process.exit(1);
});
