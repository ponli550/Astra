/**
 * Agent tool surface. Exposes the contract's functions as tools over
 * the Model Context Protocol, so an existing agent drives them instead
 * of a bespoke loop against a paid model.
 *
 *   npm run mcp        # runs on stdio; a client spawns this, you don't
 *
 * # Why all three functions are exposed, including the withheld one
 *
 * `vault_put` is offered even though the owner's grant does not name
 * it, and it is not this process's job to hide it. Tool availability is
 * not authorization, so the tool list is a menu rather than a security
 * boundary.
 *
 * Be careful what you claim from that, though. The platform's
 * enforcement point for a tenant contract is egress, and this contract
 * makes no outbound call, so a write may succeed despite being outside
 * the grant. Verified against testnet. What the write cannot escape is
 * the audit trail, which records it against this identity with
 * provenance set inside the enclave. Treat the trail as the guarantee.
 *
 * # What this process holds
 *
 * The agent's own key and nothing else. It never holds the tenant's
 * key, and it never holds the data owner's key. The subject whose
 * grant authorises each call is configuration, exactly as a real agent
 * would receive it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { z } from "zod";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, T3N_ENV } from "../config.js";
import { canonicalName, openCallerSession, resolveGrantSubject } from "../session.js";
import type { Session } from "../session.js";

/** Authentication is slow, so one session is shared across tool calls. */
let cached: Promise<{ agent: Session; contract: string; version: string; subject: string }> | undefined;

function context() {
  cached ??= (async () => {
    if (!DECLARED_TENANT_DID) {
      throw new Error("DID is not set. It names the tenant that owns the contract.");
    }
    const agent = await openCallerSession();
    const contract = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
    const [version, subject] = await Promise.all([
      getContractVersion(getNodeUrl(), contract),
      resolveGrantSubject(),
    ]);
    return { agent, contract, version, subject };
  })();
  return cached;
}

/** One call into the contract, always naming the grant subject. */
async function invoke(functionName: string, input: unknown): Promise<unknown> {
  const { agent, contract, version, subject } = await context();
  return agent.client.executeAndDecode({
    contract_id: contract,
    contract_version: version,
    function_name: functionName,
    // Omitting this makes the node check the agent's own grants, which
    // are empty, and the refusal then looks like a broken allowlist.
    pii_did: subject,
    input,
  });
}

/**
 * Report a refusal as a readable tool result rather than throwing.
 *
 * A thrown error can take down a whole agent loop on a tool's first
 * failure. A refusal here is an expected outcome the model should see
 * and reason about, so every tool returns text either way and marks
 * the failure with `isError`.
 */
function asResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function asRefusal(functionName: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text:
          `${functionName} was refused by the T3N node.\n\n${detail}\n\n` +
          `This is the enclave enforcing the data owner's grant. The tool ` +
          `being available here does not mean the call is authorised.`,
      },
    ],
  };
}

const server = new McpServer({ name: "t3n-consent-vault", version: "0.1.0" });

server.registerTool(
  "vault_status",
  {
    title: "Show which identity this agent acts as",
    description:
      "Report the agent's own identity, the contract it targets, and the identity whose " +
      "grant authorises its calls. Read-only and free. Call this first to understand " +
      "what you are permitted to do and on whose behalf.",
    inputSchema: {},
  },
  async () => {
    try {
      const { agent, contract, version, subject } = await context();
      return asResult({
        environment: T3N_ENV,
        agent_did: agent.did,
        grant_subject: subject,
        contract,
        contract_version: version,
        note:
          "The agent holds no standing access. Every call is checked against the " +
          "grant_subject's delegation, which names specific functions and expires.",
      });
    } catch (error: unknown) {
      return asRefusal("vault_status", error);
    }
  },
);

server.registerTool(
  "vault_read",
  {
    title: "Read a record from the consent-gated vault",
    description:
      "Retrieve one sensitive record. Succeeds only while the data owner's grant covers " +
      "this function and has not expired. Every attempt is recorded in a tamper-evident " +
      "audit trail inside the enclave, whether or not a record is returned, so state a " +
      "truthful purpose.",
    inputSchema: {
      record_id: z.string().describe("Record identifier, for example 'medical-1'."),
      purpose: z
        .string()
        .describe("Why this record is being accessed. Recorded verbatim in the audit trail."),
    },
  },
  async ({ record_id, purpose }) => {
    try {
      return asResult(await invoke("vault-read", { record_id, purpose }));
    } catch (error: unknown) {
      return asRefusal("vault_read", error);
    }
  },
);

server.registerTool(
  "audit_list",
  {
    title: "Read the audit trail of vault access",
    description:
      "List recorded access attempts, newest last. Every provenance field is set inside " +
      "the enclave from node-minted context, so the caller identity, timestamp and " +
      "sequence number cannot be forged by whoever made the call.",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional().describe("Maximum entries, default 100."),
    },
  },
  async ({ limit }) => {
    try {
      return asResult(await invoke("audit-list", limit === undefined ? {} : { limit }));
    } catch (error: unknown) {
      return asRefusal("audit_list", error);
    }
  },
);

server.registerTool(
  "vault_put",
  {
    title: "Write a record into the vault",
    description:
      "Store a record. The data owner's grant deliberately does not name this " +
      "function. Be aware that the platform's enforcement point for this contract " +
      "is outbound network access, which this contract never uses, so the write may " +
      "well succeed anyway. What it cannot avoid is being recorded: the audit trail " +
      "will show the write, attributed to this identity, with provenance set inside " +
      "the enclave.",
    inputSchema: {
      record_id: z.string().describe("Record identifier."),
      payload: z.string().describe("Record contents."),
    },
  },
  async ({ record_id, payload }) => {
    try {
      return asResult(await invoke("vault-put", { record_id, payload }));
    } catch (error: unknown) {
      return asRefusal("vault_put", error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
