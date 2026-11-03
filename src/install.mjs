import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const entry = { command: "npx", args: ["-y", "@atlascontext/mcp@latest", "serve"] };

function parseArgs(args) {
  const result = { client: "generic", all: false, local: false, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") result.client = args[++index] ?? "generic";
    else if (args[index] === "--all") result.all = true;
    else if (args[index] === "--local") result.local = true;
    else if (args[index] === "--dry-run") result.dryRun = true;
  }
  return result;
}

function clientPath(client, local) {
  if (client === "generic") return resolve(local ? ".mcp.json" : join(homedir(), ".config", "atlas", "mcp.json"));
  if (client === "claude") return local ? resolve(".mcp.json") : join(homedir(), ".claude", "settings.json");
  if (client === "cursor") return local ? resolve(".cursor", "mcp.json") : join(homedir(), ".cursor", "mcp.json");
  if (client === "windsurf") return local ? resolve(".windsurf", "mcp.json") : join(homedir(), ".codeium", "windsurf", "mcp_config.json");
  if (client === "gemini") return local ? resolve(".gemini", "settings.json") : join(homedir(), ".gemini", "settings.json");
  throw new Error(`Unsupported client '${client}'. Use generic, claude, cursor, windsurf or gemini.`);
}

function detectedClients(local) {
  if (local) return ["generic", "claude", "cursor", "windsurf", "gemini"];
  return ["claude", "cursor", "windsurf", "gemini"].filter((client) => existsSync(clientPath(client, false)));
}

function targetPath(options) {
  return clientPath(options.client, options.local);
}

export function install(args = [], cwd = process.cwd()) {
  const options = parseArgs(args);
  if (options.all) {
    const clients = detectedClients(options.local);
    return { installed: clients.map((client) => install(["--client", client, ...(options.local ? ["--local"] : []), ...(options.dryRun ? ["--dry-run"] : [])], cwd)) };
  }
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
