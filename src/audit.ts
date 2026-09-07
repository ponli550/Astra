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
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID } from "./config.js";
import { canonicalName, openCallerSession, resolveGrantSubject } from "./session.js";

interface AuditEntry {
  seq_no: number;
  at_secs: number;
  contract_id: number;
  tenant_did: string;
  caller_did: string;
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

  const agent = await openCallerSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);
  const subject = await resolveGrantSubject();

  const result = await agent.client.executeAndDecode<AuditListResponse>({
    contract_id: contractName,
    contract_version: version,
    function_name: "audit-list",
    // Same reason as the read: this trail belongs to the data owner's
    // grant, not to the agent's own.
    pii_did: subject,
    input: { limit: 100 },
  });

  console.log(`${result.count} audit entr${result.count === 1 ? "y" : "ies"}\n`);

  for (const entry of result.entries) {
    const when = new Date(entry.at_secs * 1000).toISOString();
    const outcome = entry.outcome || "(not recorded)";
    console.log(`seq ${entry.seq_no}  ${when}  ${outcome}`);
    console.log(`  action   ${entry.action}`);
    console.log(`  record   ${entry.record_id}`);
    console.log(`  caller   did:t3n:${entry.caller_did}`);
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
