# Atlas

Atlas is a deterministic, local project cartography server exposed through the Model Context Protocol (MCP). It does not call a model, use the network, execute project code, or invent facts.

## MCP setup

Build the package locally:

```sh
npm install
npm test
```

Configure any MCP-compatible harness with:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/absolute/path/to/atlas/src/server.mjs"]
    }
  }
}
```

The server exposes:

- `atlas_status`: inspect stack, files, scripts, entry points and documents;
- `atlas_map`: return the machine-readable project map;
- `atlas_read_file`: read one bounded file inside the project root;
- `atlas_validate_citation`: verify a `path:line` citation.
- `atlas_context_status`: inspect the compatible `.context` layout;
- `atlas_context_list`: list context files grouped by folder.

Atlas preserves the same project context folders used by the base implementation:

```text
.context/
├── docs/
├── agents/
├── skills/
├── plans/
├── config/
├── runtime/
└── cache/
```

The folders and file layout remain compatible. Only the public MCP/tool names are Atlas names. Atlas reads this context and does not rewrite or migrate it automatically.

Every tool requires an explicit `projectRoot`. Atlas never uses a hidden default project.

## Design principles

- local and deterministic;
- no LLM and no network access;
- bounded file reads;
- traversal-safe paths;
- secret placeholders for environment templates;
- stable JSON output for harnesses.

## License

MIT
