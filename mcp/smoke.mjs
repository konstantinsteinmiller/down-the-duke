import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  args: ["exec", "tsx", "mcp/server.ts"],
});
const client = new Client({name: "smoke", version: "0.0.1"}, {capabilities: {}});
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const info = await client.callTool({name: "get_project_info", arguments: {}});
console.log("get_project_info isError:", info.isError ?? false);
console.log("get_project_info first content:");
console.log(info.content[0]?.text ?? "(no text)");

await client.close();
process.exit(0);
