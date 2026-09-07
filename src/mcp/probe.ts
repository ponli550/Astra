/**
 * Smoke test for the tool server. Spawns it, completes the protocol
 * handshake, and prints the tool surface an agent would see.
 *
 *   npm run mcp:probe
 *
 * Needs no T3N credentials and spends no credits: the server
 * authenticates lazily inside a tool call, so listing tools exercises
 * the wiring without touching the network. Run this before pointing a
 * real client at it, so a protocol mistake is not diagnosed through
 * someone else's client.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED = ["vault_status", "vault_read", "audit_list", "vault_put"];

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
    cwd: process.cwd(),
  });

  const client = new Client({ name: "consent-vault-probe", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`connected. ${tools.length} tool${tools.length === 1 ? "" : "s"} exposed:\n`);

  for (const tool of tools) {
    const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
    const params = Object.keys(schema?.properties ?? {});
    console.log(`  ${tool.name}(${params.join(", ")})`);
    if (tool.title) console.log(`    ${tool.title}`);
  }

  const names = tools.map((t) => t.name);
  const missing = EXPECTED.filter((n) => !names.includes(n));
  const unexpected = names.filter((n) => !EXPECTED.includes(n));

  await client.close();

  if (missing.length > 0 || unexpected.length > 0) {
    if (missing.length > 0) console.error(`\nmissing tools: ${missing.join(", ")}`);
    if (unexpected.length > 0) console.error(`\nunexpected tools: ${unexpected.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `\nAll four tools present. Note that vault_put is listed on purpose:\n` +
      `the data owner's grant withholds it, so the node refuses the call.\n` +
      `A tool being available is not the same as it being authorised.`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nprobe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
