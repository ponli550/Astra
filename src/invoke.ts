/**
 * The action. Reads a gated record, and the attempt produces an audit
 * entry it cannot suppress.
 *
 *   npm run invoke
 *
 * # What enforces this
 *
 * Not the delegation grant. The platform's enforcement point for a
 * tenant contract is egress, and this contract makes no outbound call,
 * so there is nothing there to deny. Verified: with the grant revoked,
 * reads still succeeded.
 *
 * The contract evaluates a consent policy itself, inside the enclave,
 * against values the node mints: the calling identity from tenant
 * context and the cluster-pinned clock. A caller cannot claim to be
 * someone else and cannot move an expiry. Change consent with
 * `npm run policy:allow` and `npm run policy:deny`.
 *
 * Three calls, and only the first should return a payload:
 *
 *   1. Read the seeded record. Served, and audited.
 *   2. Read a record that does not exist. Denied, and still audited.
 *   3. Write, which consent does not cover. Refused inside the enclave.
 */
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, DEMO_RECORD } from "./config.js";
import { canonicalName, openCallerSession, resolveGrantSubject } from "./session.js";

interface VaultReadResponse {
  record_id: string;
  status: "served" | "denied";
  payload?: string;
  reason?: string;
  audit_key: string;
}

interface VaultPutResponse {
  record_id: string;
  status: "served" | "denied";
  reason?: string;
  audit_key: string;
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const caller = await openCallerSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);

  // Whose grant this call is checked against. Omitting it makes the node
  // check the caller's own grants, and the resulting denial reads like a
  // misconfigured allowlist.
  const subject = await resolveGrantSubject();

  console.log(`caller   ${caller.did}`);
  console.log(`subject  ${subject}   (whose grant authorises this)`);
  console.log(`contract ${contractName}@${version}\n`);

  const call = <T,>(functionName: string, input: unknown) =>
    caller.client.executeAndDecode<T>({
      contract_id: contractName,
      contract_version: version,
      function_name: functionName,
      pii_did: subject,
      input,
    });

  // --- a record that exists ----------------------------------------
  const served = await call<VaultReadResponse>("vault-read", {
    record_id: DEMO_RECORD,
    purpose: "demo: retrieving a record under a live grant",
  });
  console.log(`vault-read ${DEMO_RECORD}: ${served.status}`);
  console.log(`  payload   ${served.payload ?? "(none)"}`);
  console.log(`  audit_key ${served.audit_key}`);
  if (served.status !== "served") {
    console.warn(`  expected this read to be served, got ${served.status}: ${served.reason}`);
    process.exitCode = 1;
  }

  // --- a record that does not exist --------------------------------
  const denied = await call<VaultReadResponse>("vault-read", {
    record_id: "does-not-exist",
    purpose: "demo: showing a denial is recorded too",
  });
  console.log(`\nvault-read does-not-exist: ${denied.status}`);
  console.log(`  reason    ${denied.reason ?? "(none)"}`);
  console.log(`  audit_key ${denied.audit_key}`);
  if (denied.status !== "denied") {
    console.warn(`  expected a denial, got ${denied.status}`);
    process.exitCode = 1;
  }
  console.log(
    `\nThat denial kept its audit entry. The host rolls back everything a call\n` +
      `wrote if the call returns an error, so a denial raised as an error would\n` +
      `have erased its own record and left a trail of successes only.`,
  );

  // --- the function consent does not cover -------------------------
  //
  // Asserted, not merely reported. The contract now evaluates the policy
  // itself, so this is a real gate rather than a statement of intent.
  console.log(`\nvault-put, which the consent policy does not cover:`);
  const smuggled = await call<VaultPutResponse>("vault-put", {
    record_id: "probe-unauthorised",
    payload: "written by a call consent does not cover",
  });
  console.log(`  status    ${smuggled.status}`);
  console.log(`  reason    ${smuggled.reason ?? "(none)"}`);
  console.log(`  audit_key ${smuggled.audit_key}`);
  if (smuggled.status !== "denied") {
    console.error(
      `  UNEXPECTED: the write was permitted. The policy names only ` +
        `${"vault-read"} and audit-list, so this should have been refused ` +
        `inside the enclave.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `\n  Refused inside the enclave, and the refusal is recorded. This is the\n` +
        `  check the delegation grant does not make for a contract with no\n` +
        `  egress, which is why the contract makes it.`,
    );
  }

  console.log(`\nnext: npm run audit`);
}

main().catch((error: unknown) => {
  console.error(`\ninvoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
