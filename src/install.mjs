import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const entry = { command: "npx", args: ["-y", "@atlas/mcp@latest", "serve"] };

function parseArgs(args) {
  const result = { client: "generic", local: false, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") result.client = args[++index] ?? "generic";
    else if (args[index] === "--local") result.local = true;
    else if (args[index] === "--dry-run") result.dryRun = true;
  }
  return result;
}

function targetPath(options) {
  if (options.client === "generic") return resolve(options.local ? ".mcp.json" : join(homedir(), ".config", "atlas", "mcp.json"));
  if (options.client === "claude") return options.local ? resolve(".mcp.json") : join(homedir(), ".claude", "settings.json");
  if (options.client === "cursor") return options.local ? resolve(".cursor", "mcp.json") : join(homedir(), ".cursor", "mcp.json");
  if (options.client === "windsurf") return options.local ? resolve(".windsurf", "mcp.json") : join(homedir(), ".codeium", "windsurf", "mcp_config.json");
  if (options.client === "gemini") return options.local ? resolve(".gemini", "settings.json") : join(homedir(), ".gemini", "settings.json");
  throw new Error(`Unsupported client '${options.client}'. Use generic, claude, cursor, windsurf or gemini.`);
}

export function install(args = [], cwd = process.cwd()) {
  const options = parseArgs(args);
  const target = targetPath(options).replace(resolve("."), cwd);
  let config = {};
  if (existsSync(target)) {
    try { config = JSON.parse(readFileSync(target, "utf8")); } catch { throw new Error(`Cannot parse existing JSON config: ${target}`); }
  }
  config.mcpServers ??= {};
  config.mcpServers.atlas = entry;
  const content = `${JSON.stringify(config, null, 2)}\n`;
  if (!options.dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { client: options.client, path: target, dryRun: options.dryRun, config };
}
