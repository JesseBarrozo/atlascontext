#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectProject, readProjectFile, validateCitation } from "./atlas-core.mjs";

const rootSchema = z.object({ projectRoot: z.string().min(1).describe("Absolute or relative project directory") });
const server = new McpServer({ name: "atlas", version: "0.1.0" });
const result = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ content: [{ type: "text", text: error.message }], isError: true });

server.registerTool("atlas_status", { description: "Inspect a project without modifying it.", inputSchema: rootSchema }, async ({ projectRoot }) => {
  try { return result(inspectProject(projectRoot)); } catch (error) { return failure(error); }
});
server.registerTool("atlas_map", { description: "Return the deterministic machine-readable project map.", inputSchema: rootSchema }, async ({ projectRoot }) => {
  try { return result(inspectProject(projectRoot)); } catch (error) { return failure(error); }
});
server.registerTool("atlas_read_file", { description: "Read one bounded text file inside the project root.", inputSchema: rootSchema.extend({ filePath: z.string().min(1) }) }, async ({ projectRoot, filePath }) => {
  try { return result(readProjectFile(projectRoot, filePath)); } catch (error) { return failure(error); }
});
server.registerTool("atlas_validate_citation", { description: "Verify a path:line citation inside a project.", inputSchema: rootSchema.extend({ citation: z.string().min(1) }) }, async ({ projectRoot, citation }) => {
  try { return result(validateCitation(projectRoot, citation)); } catch (error) { return failure(error); }
});

await server.connect(new StdioServerTransport());
