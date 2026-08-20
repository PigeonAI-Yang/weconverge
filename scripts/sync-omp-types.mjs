#!/usr/bin/env node
// Verifies that types/omp-extension-api.d.ts matches the real PUBLIC OMP Extension API.
//
// Resolution order (no machine-specific absolute path is ever written into the project):
//   1. env OMP_SOURCE_DIR (points at an oh-my-pi source checkout)
//   2. ../../github/oh-my-pi relative to this repo (the PigeonYang workspace layout)
// If no source tree is discoverable, the project still typechecks against the local
// declarations and this script exits 0 with a WARN (drift check skipped).
// When a source tree IS found, every required member must be present or exit 1.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const candidates = [
  process.env.OMP_SOURCE_DIR,
  resolve(root, "..", "..", "github", "oh-my-pi"),
].filter(Boolean);

const src = candidates.find((c) => existsSync(join(c, "packages", "coding-agent", "src", "extensibility", "extensions", "types.ts")));

if (!src) {
  console.warn("WARN: no OMP source tree found (set OMP_SOURCE_DIR); drift check skipped, local declarations in effect.");
  process.exit(0);
}

const typesFile = join(src, "packages", "coding-agent", "src", "extensibility", "extensions", "types.ts");
const eventsFile = join(src, "packages", "coding-agent", "src", "extensibility", "shared-events.ts");
const types = readFileSync(typesFile, "utf8");
const events = readFileSync(eventsFile, "utf8");
const all = types + "\n" + events;

// Every member WEConverge declares/uses, checked against the real public surface.
const REQUIRED = [
  // ExtensionContext / model query
  "interface ExtensionContext",
  "interface ExtensionModelQuery",
  "current(): Model | undefined",
  "sessionManager: ReadonlySessionManager",
  "isIdle(): boolean",
  // thinking level (effort) API
  "getThinkingLevel(): ThinkingLevel | undefined",
  "setThinkingLevel(level: ThinkingLevel): void",
  // registration + persistence
  "registerTool",
  "registerCommand",
  "appendEntry<T = unknown>(customType: string, data?: T): void",
  "zod:",
  // command context
  "interface ExtensionCommandContext extends ExtensionContext",
  "newSession(options?",
  "notify(message: string",
  // events we subscribe
  'on(event: "session_start"',
  'on(event: "session_shutdown"',
  'event: "session_before_switch"',
  'on(event: "session_switch"',
  'on(event: "session_stop"',
  'on(event: "agent_end"',
  'on(event: "before_agent_start"',
  'on(event: "after_provider_response"',
  // event payloads
  "interface BeforeAgentStartEvent",
  "systemPrompt: string[]",
  "interface BeforeAgentStartEventResult",
  "interface AgentEndEvent",
  "willContinue?: boolean",
  "interface SessionStopEvent",
  "session_id: string",
  "interface SessionSwitchEvent",
  "previousSessionFile: string | undefined",
  "interface AfterProviderResponseEvent",
];

const missing = REQUIRED.filter((token) => !all.includes(token));
console.log(`OMP source: ${src}`);
if (missing.length > 0) {
  console.error("DRIFT: local declarations reference members not found in the real OMP API:");
  for (const m of missing) console.error("  - " + m);
  process.exit(1);
}
console.log(`OK: ${REQUIRED.length} declared members verified against the real OMP Extension API.`);
