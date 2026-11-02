import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectProject, readProjectFile, validateCitation } from "../src/atlas-core.mjs";

test("inspects manifests, scripts and stack deterministically", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" }, main: "src/main.mjs" }, null, 2));
  writeFileSync(join(root, "src-main.mjs"), "export {}\n");
  const map = inspectProject(root);
  assert.deepEqual(map.stack, ["node"]);
  assert.equal(map.scripts[0].name, "test");
  assert.equal(map.digest, inspectProject(root).digest);
});

test("rejects traversal and validates citations", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-"));
  writeFileSync(join(root, "README.md"), "# Hello\nSecond\n");
  assert.throws(() => readProjectFile(root, "../outside"), /inside the project root/);
  assert.equal(validateCitation(root, "README.md:2").valid, true);
  assert.equal(validateCitation(root, "README.md:8").valid, false);
});
