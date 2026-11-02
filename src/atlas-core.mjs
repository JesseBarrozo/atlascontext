import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SKIP = new Set([".git", "node_modules", "dist", "build", "out", "coverage", ".cache", ".next", ".turbo", "vendor", "target"]);
const TEXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".swift", ".md", ".json", ".toml", ".yml", ".yaml", ".sql", ".prisma", ".xml", ".txt", ".sh"]);
const SOURCE = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".swift", ".vue", ".svelte", ".c", ".h", ".cpp", ".hpp"]);
const MANIFESTS = new Map([["package.json", "node"], ["pyproject.toml", "python"], ["requirements.txt", "python"], ["go.mod", "go"], ["Cargo.toml", "rust"], ["Gemfile", "ruby"], ["pom.xml", "java"], ["composer.json", "php"]]);
const SECRET = /PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL/i;
const URL = /https?:\/\/([a-z0-9.-]+)/gi;

function walk(root, maxFiles) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= maxFiles || entry.isSymbolicLink()) return;
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith(".")) visit(join(dir, entry.name));
      } else if (entry.isFile()) files.push(relative(root, join(dir, entry.name)).split("\\").join("/"));
    }
  }
  visit(root);
  return files.sort();
}

function snapshot(root, options) {
  const files = walk(root, options.maxFiles);
  const contents = new Map();
  for (const file of files) {
    const full = join(root, file);
    if (TEXT.has(extname(file).toLowerCase()) && statSync(full).size <= options.maxBytes) contents.set(file, readFileSync(full, "utf8"));
  }
  return { files, contents };
}

function line(text, needle) {
  const index = text.indexOf(needle);
  return index < 0 ? 1 : text.slice(0, index).split("\n").length;
}

function digest(snapshot) {
  const hash = createHash("sha256");
  for (const [file, content] of snapshot.contents) hash.update(`${file}\0${content}\0`);
  return hash.digest("hex").slice(0, 16);
}

export function inspectProject(projectRoot, options = {}) {
  const root = resolve(projectRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("Project root does not exist or is not a directory.");
  const settings = { maxFiles: options.maxFiles ?? 20000, maxBytes: options.maxBytes ?? 1_000_000 };
  const snapshotData = snapshot(root, settings);
  const manifests = snapshotData.files.filter((file) => MANIFESTS.has(file.split("/").pop())).map((file) => ({ path: file, kind: MANIFESTS.get(file.split("/").pop()) }));
  const stack = [...new Set([...manifests.map((item) => item.kind), ...(snapshotData.files.includes("tsconfig.json") ? ["typescript"] : [])])].sort();
  const scripts = [];
  const entryPoints = [];
  const documents = [];
  const externalHosts = [];
  for (const [file, content] of snapshotData.contents) {
    const name = file.split("/").pop();
    if (name === "package.json") {
      try {
        const json = JSON.parse(content);
        for (const [script, command] of Object.entries(json.scripts ?? {})) scripts.push({ name: script, command: String(command), file, line: line(content, `"${script}"`) });
        for (const field of ["main", "bin"]) {
          const values = typeof json[field] === "string" ? [json[field]] : Object.values(json[field] ?? {});
          for (const value of values) entryPoints.push({ path: String(value), kind: field, declaredIn: file, line: line(content, `"${field}"`) });
        }
      } catch { /* malformed manifests remain visible in the file list */ }
    }
    if (/^(README|AGENTS|CLAUDE|CONTRIBUTING|ARCHITECTURE|CHANGELOG).*\.md$/i.test(name) || file.startsWith("docs/")) {
      const heading = /^#\s+(.+)$/m.exec(content);
      documents.push({ path: file, title: heading?.[1]?.trim() ?? name, line: heading ? line(content, heading[0]) : 1 });
    }
    if (file.startsWith(".env.") || file.endsWith("/.env.example")) {
      for (const [index, row] of content.split("\n").entries()) {
        const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(row);
        if (match) documents.push({ path: file, title: `${match[1]}=${SECRET.test(match[1]) ? "<secret placeholder>" : match[2]}`, line: index + 1 });
      }
    }
    for (const match of content.matchAll(URL)) {
      if (!/localhost|127\.0\.0\.1|example\.(com|org|net)/i.test(match[1])) externalHosts.push({ host: match[1].toLowerCase(), file, line: line(content, match[0]) });
    }
  }
  return { schemaVersion: 1, root, digest: digest(snapshotData), sourceFiles: snapshotData.files.filter((file) => SOURCE.has(extname(file))).length, files: snapshotData.files, stack, manifests, scripts, entryPoints, documents, externalHosts };
}

export function readProjectFile(projectRoot, filePath, options = {}) {
  const root = resolve(projectRoot);
  const requested = filePath.replaceAll("\\", "/");
  if (!requested || requested.startsWith("/") || requested.split("/").includes("..")) throw new Error("filePath must stay inside the project root.");
  const target = resolve(root, requested);
  if (target !== root && !target.startsWith(`${root}/`)) throw new Error("filePath must stay inside the project root.");
  if (!existsSync(target) || !statSync(target).isFile()) throw new Error("Requested file does not exist.");
  const maxBytes = options.maxBytes ?? 1_000_000;
  if (statSync(target).size > maxBytes) throw new Error("Requested file exceeds the configured size limit.");
  return { path: requested, content: readFileSync(target, "utf8") };
}

export function validateCitation(projectRoot, citation) {
  const match = /^(.+):(\d+)$/.exec(citation);
  if (!match) return { valid: false, reason: "Citation must use path:line format." };
  try {
    const file = readProjectFile(projectRoot, match[1]);
    const count = file.content.split("\n").length;
    return { valid: Number(match[2]) >= 1 && Number(match[2]) <= count, path: match[1], line: Number(match[2]), lineCount: count };
  } catch (error) { return { valid: false, reason: error.message }; }
}
