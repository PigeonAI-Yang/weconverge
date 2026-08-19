// Command parser for /weconverge on|off|status|reset. (CAP-010/AC-029)
export type WeconvergeCommand = "on" | "off" | "status" | "reset" | "usage";

export interface ParsedCommand {
  cmd: WeconvergeCommand;
  usage: boolean;
}

const VALID: WeconvergeCommand[] = ["on", "off", "status", "reset"];

export function parseCommand(raw: string): ParsedCommand {
  const arg = (raw ?? "").trim();
  // Accept "/weconverge on" or "weconverge on" or "on".
  const parts = arg.replace(/^\/?weconverge\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { cmd: "usage", usage: true };
  const cmd = parts[0] as WeconvergeCommand;
  if (!VALID.includes(cmd)) return { cmd: "usage", usage: true };
  // status/usage take no extra args; on/off/reset ignore extras but remain valid
  if (cmd === "status" && parts.length > 1) return { cmd: "usage", usage: true };
  return { cmd, usage: false };
}

export const USAGE_TEXT = "usage: /weconverge <on|off|status|reset>";
