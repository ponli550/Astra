/**
 * The receipt. Reads back the audit trail the attempts produced.
 *
 *   npm run audit
 *
 * Every provenance field here is set inside the enclave from
 * node-minted context, not from the caller's input: the sequence
 * number, the cluster timestamp, the contract id and the calling
 * identity cannot be forged by whoever made the call.
 */
import { DECLARED_TENANT_DID } from "./config.js";
import { openCaller } from "./caller.js";
import { resolveGrantSubject } from "./session.js";

interface AuditEntry {
  seq_no: number;
  at_secs: number;
  contract_id: number;
  tenant_did: string;
  caller_did: string;
  /** Whose data it is; equal to caller_did on a self-call. Absent on entries older than 0.5.1. */
  subject_did?: string;
  action: string;
  record_id: string;
  purpose: string;
  outcome: string;
  reason: string;
}

interface AuditListResponse {
  entries: AuditEntry[];
  count: number;
  malformed_entries: number;
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const caller = await openCaller();
  const subject = await resolveGrantSubject();

  // Same reason as the read: this trail belongs to the data owner's
  // consent, not to the caller's own.
  const result = await caller.call<AuditListResponse>("audit-list", { limit: 100 }, subject);

  console.log(`${result.count} audit entr${result.count === 1 ? "y" : "ies"}\n`);

  for (const entry of result.entries) {
    const when = new Date(entry.at_secs * 1000).toISOString();
    const outcome = entry.outcome || "(not recorded)";
    console.log(`seq ${entry.seq_no}  ${when}  ${outcome}`);
    console.log(`  action   ${entry.action}`);
    console.log(`  record   ${entry.record_id}`);
    console.log(`  caller   did:t3n:${entry.caller_did}`);
    if (entry.subject_did && entry.subject_did !== entry.caller_did) {
      console.log(`  for      did:t3n:${entry.subject_did}   (delegated)`);
    }
    console.log(`  contract ${entry.contract_id}`);
    if (entry.purpose) console.log(`  purpose  ${entry.purpose}`);
    if (entry.reason) console.log(`  reason   ${entry.reason}`);
    console.log();
  }

  if (result.malformed_entries > 0) {
    console.warn(
      `${result.malformed_entries} stored entr${result.malformed_entries === 1 ? "y was" : "ies were"} ` +
        `not decodable and were skipped.\n` +
        `Reading the rest still works, but something wrote a malformed entry.`,
    );
  }

  if (result.count === 0) {
    console.log(`Nothing recorded yet. Run: npm run invoke`);
  }
}

main().catch((error: unknown) => {
  console.error(`\naudit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
