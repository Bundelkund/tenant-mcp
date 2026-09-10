# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Vendored at commit: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b (main, 2026-09-10)
- Installed via: `install-anti-slop` skill (skills.sh), `scripts/install.mjs`
- Installed paths:
  - `tools/oxlint/anti-slop/` (plugin source)
  - `oxlint.config.ts` (registration, project root)
- Dependencies pinned: `oxlint@1.82.0`, `@oxlint/plugins@1.82.0` (both devDependencies)
- Rules enabled: all generic anti-slop rules + `oxc/no-accumulating-spread`
- Rules NOT enabled: Effect-specific rules (`anti-slop-effect/*`) — this repo has no
  direct `effect` dependency
- Deviations:
  - `anti-slop/no-runtime-typeof` configured with `{ allowInTypeGuards: true }`
    (default is `false`). Needed for the two named type-guard helpers in
    `src/tenant-client.ts` (`isDetailRecord`, `isPlainString`) that narrow the
    JSON.parse result — exactly the "parse at the I/O boundary" pattern the
    rule asks for, expressed as a type predicate.
