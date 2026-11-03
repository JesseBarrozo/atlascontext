#!/usr/bin/env node
import { install } from "./install.mjs";

const [command = "serve", ...args] = process.argv.slice(2);
if (command === "install") {
  try {
    process.stdout.write(`${JSON.stringify(install(args), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
} else if (command === "serve") {
  await import("./server.mjs");
} else if (command === "generate" || command === "check") {
  const { checkAtlas, writeAtlas } = await import("./atlas-core.mjs");
  const projectRoot = args[0] ?? process.env.ATLAS_PROJECT;
  if (!projectRoot) {
    process.stderr.write("Usage: atlas-mcp generate|check <project-root>\n");
    process.exitCode = 1;
  } else if (command === "generate") process.stdout.write(`${JSON.stringify(writeAtlas(projectRoot), null, 2)}\n`);
  else {
    const errors = checkAtlas(projectRoot);
    if (errors.length) { process.stderr.write(`${errors.join("\n")}\n`); process.exitCode = 1; }
    else process.stdout.write("Atlas is current and citations resolve.\n");
  }
} else {
  process.stderr.write("Usage: atlas-mcp <install|serve|generate|check>\n");
  process.exitCode = 1;
}
