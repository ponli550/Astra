/**
 * Agent tool surface. Exposes the contract's functions as tools over
 * the Model Context Protocol, so an existing agent drives them instead
 * of a bespoke loop against a paid model.
 *
 *   npm run mcp        # runs on stdio; a client spawns this, you don't
 *
 * # Why all four tools are exposed, including the withheld one
 *
 * `vault_put` is offered even though consent does not cover it, and it
 * is not this process's job to hide it. Tool availability is not
 * authorization: the tool list is a menu, and the contract decides.
 *
 * A model that calls it is refused inside the enclave, with a reason,
 * and the refusal is recorded. Verified against testnet. Hiding the
 * tool would make this process look like the security boundary, which
 * is the confusion most worth dispelling.
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
import { z } from "zod";
import { T3N_ENV } from "../config.js";
import { openCaller, type Caller } from "../caller.js";
import { resolveGrantSubject } from "../session.js";

/** Authentication is slow, so one caller is shared across tool calls. */
let cached: Promise<{ caller: Caller; subject: string }> | undefined;

function context() {
  cached ??= (async () => {
    const [caller, subject] = await Promise.all([openCaller(), resolveGrantSubject()]);
    return { caller, subject };
  })();
  return cached;
}

/** One call into the contract, always naming the grant subject. */
async function invoke(functionName: string, input: unknown): Promise<unknown> {
  const { caller, subject } = await context();
  // Omitting the subject makes the node check the caller's own grants,
  // and the refusal then looks like a broken allowlist.
  return caller.call(functionName, input, subject);
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
      const { caller, subject } = await context();
      return asResult({
        environment: T3N_ENV,
        agent_did: caller.did,
        transport: caller.kind,
        grant_subject: subject,
        contract: caller.contract,
        contract_version: caller.version,
        note:
          "This caller holds no standing access. Every call is evaluated inside the " +
          "enclave against a consent policy that names permitted callers and " +
          "functions and carries an expiry. Use audit_list to see what has been " +
          "attempted and what was refused.",
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
      "Retrieve one sensitive record. Succeeds only while the consent policy names " +
      "this caller and this function and has not lapsed, all evaluated inside the " +
      "enclave against a cluster-pinned clock. Every attempt is recorded in a " +
      "tamper-evident audit trail whether or not a record is returned, so state a " +
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
    title: "Write a record into the vault (consent does not cover this)",
    description:
      "Store a record. The consent policy deliberately does not permit this " +
      "function, so the contract refuses it inside the enclave and records the " +
      "refusal with a reason. It is listed here to show that a tool being available " +
      "is not the same as a call being permitted.",
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
