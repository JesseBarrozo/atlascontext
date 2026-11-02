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
