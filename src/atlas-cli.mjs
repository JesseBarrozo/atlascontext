#!/usr/bin/env node
import { checkAtlas, writeAtlas } from "./atlas-core.mjs";

const [command = "generate", projectRoot = process.env.ATLAS_PROJECT] = process.argv.slice(2);
if (!projectRoot || !["generate", "check"].includes(command)) {
  process.stderr.write("Usage: node src/atlas-cli.mjs <generate|check> <project-root>\n");
  process.exitCode = 1;
} else if (command === "generate") {
  process.stdout.write(`${JSON.stringify(writeAtlas(projectRoot), null, 2)}\n`);
} else {
  const errors = checkAtlas(projectRoot);
  if (errors.length) { process.stderr.write(`${errors.join("\n")}\n`); process.exitCode = 1; }
  else process.stdout.write("Atlas is current and citations resolve.\n");
}
