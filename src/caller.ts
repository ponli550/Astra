/**
 * Who calls the contract, and over which transport.
 *
 * Two transports exist and they authenticate differently:
 *
 *   session   an Ethereum key signs a login challenge and the calls go
 *             through an encrypted session. The tenant and any eth-key
 *             agent use this.
 *   bearer    an org-owned agent presents an opaque token on a stateless
 *             invoke. No handshake, no session. This is what the minted
 *             agents use, and it is what delegated mode needs.
 *
 * Scripts, the tool server and the console all ask for a caller here
 * and never care which transport answered. Selection is configuration:
 *
 *   AGENT_API_KEY set     bearer, as the minted agent (AGENT_DID)
 *   AGENT_KEY set         session, as an eth-key agent
 *   otherwise             session, as the owner calling its own contract
 *
 * CALLER=second selects the second minted agent (AGENT2_*), for the
 * delegation-chain demo. CALLER=tenant (or owner) forces the owner's own
 * session even when agent credentials exist, which is how the owner
 * grants root consent and administers policy in delegated mode.
 */
import { getContractVersion, getNodeUrl, invoke, setEnvironment } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, T3N_ENV } from "./config.js";
import { canonicalName, openCallerSession } from "./session.js";

export interface Caller {
  /** Which transport answered. */
  kind: "session" | "bearer";
  /** Short label for logs. */
  role: string;
  did: string;
  contract: string;
  version: string;
  /** Invoke one contract function, naming the grant subject. */
  call<T = unknown>(functionName: string, input: unknown, subject: string): Promise<T>;
}

function bearerSlot(): "AGENT" | "AGENT2" | undefined {
  const which = (process.env["CALLER"] ?? "").toLowerCase();
  if (which === "tenant" || which === "owner" || which === "self") return undefined;
  if (which === "second" || which === "agent2" || which === "b") {
    return process.env["AGENT2_API_KEY"] ? "AGENT2" : undefined;
  }
  return process.env["AGENT_API_KEY"] ? "AGENT" : undefined;
}

/** True when the configuration selects a minted, bearer-token agent. */
export function usesBearer(): boolean {
  return bearerSlot() !== undefined;
}

async function contractRef(): Promise<{ contract: string; version: string }> {
  if (!DECLARED_TENANT_DID) throw new Error("DID is not set in .env.");
  setEnvironment(T3N_ENV);
  const contract = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contract);
  return { contract, version };
}

export async function openCaller(): Promise<Caller> {
  const slot = bearerSlot();

  if (slot) {
    const apiKey = process.env[`${slot}_API_KEY`];
    const did = process.env[`${slot}_DID`];
    if (!apiKey || !did) {
      throw new Error(`${slot}_API_KEY and ${slot}_DID must both be set. Run: npm run agent:mint`);
    }
    const { contract, version } = await contractRef();
    const baseUrl = getNodeUrl();
    return {
      kind: "bearer",
      role: slot === "AGENT2" ? "agent B (minted)" : "agent A (minted)",
      did,
      contract,
      version,
      call: <T,>(functionName: string, input: unknown, subject: string) =>
        invoke<T>({
          baseUrl,
          apiKey,
          request: {
            contract_id: contract,
            contract_version: version,
            function_name: functionName,
            pii_did: subject,
            input,
          },
        }),
    };
  }

  const session = await openCallerSession();
  const { contract, version } = await contractRef();
  return {
    kind: "session",
    role: session.role,
    did: session.did,
    contract,
    version,
    call: <T,>(functionName: string, input: unknown, subject: string) =>
      session.client.executeAndDecode<T>({
        contract_id: contract,
        contract_version: version,
        function_name: functionName,
        pii_did: subject,
        input,
      }),
  };
}
