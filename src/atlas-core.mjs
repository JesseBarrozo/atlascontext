import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
        if (!SKIP.has(entry.name) && (!entry.name.startsWith(".") || entry.name === ".context")) visit(join(dir, entry.name));
      } else if (entry.isFile()) {
        const file = relative(root, join(dir, entry.name)).split("\\").join("/");
        if (!file.startsWith("atlas/") && !file.startsWith(".context/runtime/") && !file.startsWith(".context/cache/")) files.push(file);
      }
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
  const contextFiles = snapshotData.files.filter((file) => file.startsWith(".context/"));
  const contextFolders = ["docs", "agents", "skills", "plans", "config", "runtime", "cache"].filter((folder) => existsSync(join(root, ".context", folder)));
  return { schemaVersion: 1, root, digest: digest(snapshotData), sourceFiles: snapshotData.files.filter((file) => SOURCE.has(extname(file)) && !file.startsWith(".context/")).length, files: snapshotData.files, stack, manifests, scripts, entryPoints, documents, externalHosts, context: { present: existsSync(join(root, ".context")), folders: contextFolders, files: contextFiles } };
}

export function inspectContext(projectRoot, options = {}) {
  const map = inspectProject(projectRoot, options);
  const groups = new Map();
  for (const file of map.context.files) {
    const folder = file.split("/")[1] ?? "root";
    const items = groups.get(folder) ?? [];
    items.push(file);
    groups.set(folder, items);
  }
  return { present: map.context.present, folders: map.context.folders, groups: Object.fromEntries([...groups].map(([name, files]) => [name, files.sort()])) };
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

function table(headers, rows) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function citation(item) { return `\`${item.file ?? item.path}:${item.line ?? 1}\``; }

function generatedHeader(digestValue) { return `<!-- generated by atlas. Do not edit by hand. Source digest: ${digestValue} -->`; }

function renderPages(map) {
  const pages = new Map();
  pages.set("map.md", [generatedHeader(map.digest), "", "# Project map", "", `Stack: ${map.stack.length ? map.stack.map((item) => `\`${item}\``).join(", ") : "none detected"}.`, "", table(["Metric", "Value"], [["Source files", map.sourceFiles], ["Files", map.files.length], ["Entry points", map.entryPoints.length], ["Scripts", map.scripts.length], ["Documents", map.documents.length]]), "", "## Manifests", "", map.manifests.length ? table(["Path", "Kind", "Citation"], map.manifests.map((item) => [`\`${item.path}\``, item.kind, `\`${item.path}:1\``])) : "None detected.", "", "## Entry points", "", map.entryPoints.length ? table(["Path", "Kind", "Declared at"], map.entryPoints.map((item) => [`\`${item.path}\``, item.kind, `\`${item.declaredIn}:${item.line}\``])) : "None detected.", "", "## Scripts", "", map.scripts.length ? table(["Name", "Command", "Declared at"], map.scripts.map((item) => [`\`${item.name}\``, `\`${item.command}\``, `\`${item.file}:${item.line}\``])) : "None declared.", ""].join("\n"));
  pages.set("documents.md", [generatedHeader(map.digest), "", "# Documents", "", map.documents.length ? table(["Title", "Path", "Citation"], map.documents.map((item) => [item.title.replaceAll("|", "\\|"), `\`${item.path}\``, `\`${item.path}:${item.line}\``])) : "None detected.", ""].join("\n"));
  pages.set("config.md", [generatedHeader(map.digest), "", "# Configuration", "", "Environment template variables are listed without exposing secret values.", "", map.documents.filter((item) => item.title.includes("=" )).length ? table(["Variable", "Value", "Citation"], map.documents.filter((item) => item.title.includes("=")).map((item) => { const [key, value] = item.title.split("="); return [`\`${key}\``, value, `\`${item.path}:${item.line}\``]; })) : "No environment templates detected.", ""].join("\n"));
  pages.set("external-dependencies.md", [generatedHeader(map.digest), "", "# External dependencies", "", map.externalHosts.length ? table(["Host", "Citation"], map.externalHosts.map((item) => [`\`${item.host}\``, `\`${item.file}:${item.line}\``])) : "None detected.", ""].join("\n"));
  if (map.context.present) pages.set("context.md", [generatedHeader(map.digest), "", "# Context layout", "", `The compatible context directory contains: ${map.context.folders.map((folder) => `\`.context/${folder}/\``).join(", ") || "no recognized folders"}.`, "", map.context.files.length ? table(["File", "Citation"], map.context.files.map((file) => [`\`${file}\``, `\`${file}:1\``])) : "No context files detected.", ""].join("\n"));
  const index = { schemaVersion: 1, generator: "atlas", digest: map.digest, stack: map.stack, sourceFiles: map.sourceFiles, entryPoints: map.entryPoints, scripts: map.scripts, documents: map.documents, externalHosts: map.externalHosts, context: map.context, pages: [...pages.keys()].map((name) => `${name}`) };
  pages.set("index.json", `${JSON.stringify(index, null, 2)}\n`);
  pages.set("README.md", [generatedHeader(map.digest), "", "# Project atlas", "", "Generated deterministic project map. Every factual row points to a source citation.", "", table(["Page", "Description"], [...pages.keys()].map((name) => [`[${name}](${name})`, name === "index.json" ? "Machine-readable index" : "Generated project documentation"])), "", "Regenerate after changing project sources.", ""].join("\n"));
  return pages;
}

export function generateAtlas(projectRoot, options = {}) { return renderPages(inspectProject(projectRoot, options)); }

export function writeAtlas(projectRoot, options = {}) {
  const root = resolve(projectRoot);
  const pages = generateAtlas(root, options);
  const directory = join(root, "atlas");
  mkdirSync(directory, { recursive: true });
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isFile() && (name.endsWith(".md") || name === "index.json") && readFileSync(file, "utf8").startsWith("<!-- generated by atlas." ) && !pages.has(name)) unlinkSync(file);
  }
  for (const [name, content] of pages) writeFileSync(join(directory, name), content);
  return { root, generated: [...pages.keys()], digest: inspectProject(root, options).digest };
}

export function checkAtlas(projectRoot, options = {}) {
  const root = resolve(projectRoot);
  const expected = generateAtlas(root, options);
  const errors = [];
  const directory = join(root, "atlas");
  for (const [name, content] of expected) {
    const file = join(directory, name);
    if (!existsSync(file)) errors.push(`atlas/${name} is missing: run atlas_generate.`);
    else if (readFileSync(file, "utf8") !== content) errors.push(`atlas/${name} is stale: run atlas_generate.`);
  }
  if (existsSync(directory)) for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isFile() && (name.endsWith(".md") || name === "index.json") && readFileSync(file, "utf8").startsWith("<!-- generated by atlas." ) && !expected.has(name)) errors.push(`atlas/${name} is obsolete: run atlas_generate.`);
  }
  for (const [name, content] of expected) if (name.endsWith(".md")) {
    for (const match of content.matchAll(/`([^`\n]+):(\d+)`/g)) {
      const citationResult = validateCitation(root, `${match[1]}:${match[2]}`);
      if (!citationResult.valid) errors.push(`atlas/${name}: invalid citation ${match[1]}:${match[2]}.`);
    }
  }
  return errors;
}
