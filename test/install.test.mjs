import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { install } from "../src/install.mjs";

test("installs a local MCP entry without removing existing servers", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-install-"));
  const result = install(["--local"], root);
  const config = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
  assert.equal(result.client, "generic");
  assert.equal(config.mcpServers.atlas.args[2], "serve");
});

test("supports dry-run without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-install-"));
  install(["--local", "--dry-run"], root);
  assert.throws(() => readFileSync(join(root, ".mcp.json")), /ENOENT/);
});
