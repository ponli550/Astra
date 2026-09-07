/**
 * Data layer for the owner's console. Kept separate from the view so
 * the polling and formatting are testable without a terminal.
 *
 * Everything here runs as the DATA OWNER, not as the agent. That is
 * the point: the console reads the enclave's own record through the
 * owner's self-grant, so it keeps working after the agent's grant is
 * revoked. A console that read through the agent's authority would go
 * dark the moment you used it.
 */
import { getContractVersion, getNodeUrl, type BoundGrant } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID } from "../config.js";
import { canonicalName, openAgentSession, openOwnerSession } from "../session.js";
import type { Session } from "../session.js";

export interface AuditEntry {
  seq_no: number;
  at_secs: number;
  contract_id: number;
  caller_did: string;
  action: string;
  record_id: string;
  purpose: string;
  outcome: string;
  reason: string;
}

export interface AuditSnapshot {
  entries: AuditEntry[];
  count: number;
  malformed_entries: number;
}

export interface GrantView {
  /** Whether a grant to the agent currently exists. */
  present: boolean;
  functions: string[];
  validUntilSecs?: number;
  versionReq?: string;
}

export interface Snapshot {
  /** False when the keys never authenticated, so no grant can be read. */
  authenticated: boolean;
  agentDid: string;
  ownerDid: string;
  contract: string;
  version: string;
  grant: GrantView;
  audit: AuditSnapshot;
  /** Populated when a poll fails, so the view can show it and carry on. */
  error?: string;
}

let session: { agent: Session; owner: Session; contract: string; version: string } | undefined;

async function connect() {
  if (session) return session;
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set. It names the tenant that owns the contract.");
  }
  const [agent, owner] = await Promise.all([openAgentSession(), openOwnerSession()]);
  const contract = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contract);
  session = { agent, owner, contract, version };
  return session;
}

/** Seconds left on a grant, floored at zero. `undefined` if unbounded. */
export function secondsRemaining(validUntilSecs: number | undefined, nowSecs: number) {
  if (validUntilSecs === undefined) return undefined;
  return Math.max(0, validUntilSecs - nowSecs);
}

/** Human countdown, for example `11m42s`. */
export function formatRemaining(seconds: number | undefined): string {
  if (seconds === undefined) return "no expiry";
  if (seconds === 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

/**
 * Fixed-width progress bar for the remaining share of a grant's life.
 * Needs the original length, because remaining time alone cannot say
 * what fraction is left.
 */
export function progressBar(remaining: number | undefined, total: number, width = 10): string {
  if (remaining === undefined) return "-".repeat(width);
  const share = total <= 0 ? 0 : Math.min(1, Math.max(0, remaining / total));
  const filled = Math.round(share * width);
  return "#".repeat(filled) + "-".repeat(width - filled);
}

/**
 * Shorten a DID for a narrow pane without losing its distinguishing
 * head. Anything that is not a DID passes through untouched, so a
 * status string is never dressed up as an identity.
 */
export function shortDid(did: string, keep = 10): string {
  if (!did.startsWith("did:t3n:")) return did;
  const body = did.slice("did:t3n:".length);
  return body.length <= keep ? did : `did:t3n:${body.slice(0, keep)}...`;
}

function toGrantView(grants: BoundGrant[], agentDid: string, contract: string): GrantView {
  const row = grants.find((g) => g.grantee === agentDid && g.contract_id === contract);
  if (!row) return { present: false, functions: [] };
  const view: GrantView = { present: true, functions: row.functions };
  if (row.window?.valid_until_secs !== undefined) {
    view.validUntilSecs = row.window.valid_until_secs;
  }
  if (row.version_req !== undefined) view.versionReq = row.version_req;
  return view;
}

const EMPTY_AUDIT: AuditSnapshot = { entries: [], count: 0, malformed_entries: 0 };
const NO_GRANT: GrantView = { present: false, functions: [] };

/**
 * One poll. Never throws, so the view always has something to render.
 *
 * Authentication is inside the guarded path on purpose. The first thing
 * anyone hits is a missing key, and if that rejected instead of
 * returning, the console would sit on its loading state forever with
 * nothing on screen to say why.
 */
export async function poll(): Promise<Snapshot> {
  let ready: Awaited<ReturnType<typeof connect>>;
  try {
    ready = await connect();
  } catch (error: unknown) {
    return {
      authenticated: false,
      agentDid: "not authenticated",
      ownerDid: "not authenticated",
      contract: "unknown",
      version: "unknown",
      grant: NO_GRANT,
      audit: EMPTY_AUDIT,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const { agent, owner, contract, version } = ready;
  const base = {
    authenticated: true,
    agentDid: agent.did,
    ownerDid: owner.did,
    contract,
    version,
  };

  try {
    const [doc, audit] = await Promise.all([
      owner.client.getMemberDelegation(),
      // Read through the OWNER's self-grant, so a revoke of the agent
      // does not blind this console.
      owner.client.executeAndDecode<AuditSnapshot>({
        contract_id: contract,
        contract_version: version,
        function_name: "audit-list",
        pii_did: owner.did,
        input: { limit: 100 },
      }),
    ]);

    return {
      ...base,
      grant: toGrantView(doc.grants, agent.did, contract),
      audit,
    };
  } catch (error: unknown) {
    return {
      ...base,
      grant: NO_GRANT,
      audit: EMPTY_AUDIT,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Withdraw the agent's grant for this contract, leaving its others alone. */
export async function revokeAgent(): Promise<void> {
  const { agent, owner, contract } = await connect();
  await owner.client.removeMemberDelegationGrants([
    { grantee: agent.did, contract_id: contract },
  ]);
}
