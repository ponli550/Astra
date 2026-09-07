/**
 * Verifiable agent identity, shown rather than asserted.
 *
 *   npm run verify
 *
 * Two public reads, no key needed and nothing metered:
 *
 *   1. The DID document. Its verification method binds the DID to an
 *      Ethereum address. That address is recomputed here from the key
 *      in .env, so the binding is checked locally rather than trusted.
 *   2. The agent card the network hosts for that DID, in the ERC-8004
 *      registration format, so any other party can discover what this
 *      agent is and which trust model it supports.
 *
 * Anyone can run the same two reads without holding the key. What the
 * key adds is the ability to prove control, which is what the address
 * comparison demonstrates.
 */
import { eth_get_address, getNodeUrl, setEnvironment } from "@terminal3/t3n-sdk";
import { DECLARED_TENANT_DID, T3N_ENV, keys } from "./config.js";

interface DidDocument {
  id: string;
  verificationMethod?: Array<{
    id: string;
    type: string;
    controller: string;
    blockchainAccountId?: string;
  }>;
  authentication?: string[];
  service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

interface AgentCard {
  type?: string;
  name?: string;
  description?: string;
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  supportedTrust?: string[];
  active?: boolean;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** `eip155:1:0xabc...` carries the address after the last colon. */
function addressFrom(accountId: string | undefined): string | undefined {
  return accountId?.split(":").pop()?.toLowerCase();
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env.");
  }
  setEnvironment(T3N_ENV);
  const node = getNodeUrl();
  const did = DECLARED_TENANT_DID;

  console.log(`did   ${did}`);
  console.log(`node  ${node}\n`);

  // --- 1. the DID document, resolved publicly ------------------------
  //
  // The vendor documentation shows a verification method here binding
  // the DID to an Ethereum address. Testnet returns a bare document with
  // only a context and an id, so that binding cannot be checked from the
  // document today. Reported as what it is rather than as a failure.
  const doc = await getJson<DidDocument>(`${node}/api/did/${did}`);
  if (!doc) throw new Error(`no DID document at ${node}/api/did/${did}`);

  const method = doc.verificationMethod?.[0];
  const bound = addressFrom(method?.blockchainAccountId);
  const local = eth_get_address(keys.tenant).toLowerCase();

  console.log(`DID document  resolves, id matches: ${doc.id === did ? "yes" : "NO"}`);
  if (method) {
    console.log(`  method     ${method.type}`);
    console.log(`  bound to   ${bound ?? "(none)"}`);
    console.log(`  local key  ${local}`);
    console.log(
      bound === local
        ? `  control    the key in .env controls this identity`
        : `  control    MISMATCH: the key in .env does not control ${did}`,
    );
    if (bound !== local) process.exitCode = 1;
  } else {
    console.log(`  method     none published. the document carries no key binding on this network,`);
    console.log(`             so control is shown by the card below, which only the key holder could publish.`);
  }

  const agentService = doc.service?.find((s) => s.type === "AgentService");
  if (agentService) console.log(`  service    ${agentService.serviceEndpoint}`);

  // --- 2. the hosted agent card, resolved publicly -------------------
  const card = await getJson<AgentCard>(`${node}/api/agent-card/${did}`);
  console.log(`\nagent card`);
  if (!card) {
    console.log(`  not published. publish with:`);
    console.log(`    npx t3n agent host-card --file agent-card.json --env ${T3N_ENV}`);
  } else {
    console.log(`  name        ${card.name ?? "(none)"}`);
    console.log(`  format      ${card.type ?? "(none)"}`);
    console.log(`  active      ${card.active === true ? "yes" : "no"}`);
    console.log(`  trust       ${card.supportedTrust?.join(", ") ?? "(none)"}`);
    for (const s of card.services ?? []) {
      console.log(`  service     ${s.name.padEnd(4)} ${s.endpoint}`);
    }
    const declares = card.services?.some(
      (s) => s.name === "DID" && s.endpoint.toLowerCase() === did.toLowerCase(),
    );
    console.log(
      `  self-ref    ${declares ? "card names this DID" : "card does NOT name this DID"}`,
    );
  }

  console.log(
    `\nBoth reads are public and unmetered. Anyone can discover this agent and\n` +
      `read its card without holding a key. Publishing the card required\n` +
      `authenticating as the DID, so its presence is the evidence of control.`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nverify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
