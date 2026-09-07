/**
 * The action. Reads a gated record, and the attempt produces an audit
 * entry it cannot suppress.
 *
 *   npm run invoke
 *
 * # What is actually enforced, and what is not
 *
 * A grant names a contract, its functions, and the external hosts it
 * may reach. Only the last of those is a hard gate for a tenant
 * contract: the platform's enforcement point is egress, and the
 * published reference revokes access by clearing allowed hosts while
 * leaving the function list populated, which makes the function still
 * run and only its outbound call fail.
 *
 * This contract makes no outbound call, so there is nothing for the
 * platform to deny. Verified against testnet: with the grant fully
 * revoked, `vault-read` still returns the record.
 *
 * What that leaves standing is the audit trail. Provenance is set inside
 * the enclave from node-minted context, so the caller identity,
 * timestamp and sequence number cannot be forged, and a denial is
 * recorded as faithfully as a success. That part is real and verified.
 *
 * The consequence for the demo: talk about the audit trail as evidence,
 * not about the function list as a barrier.
 */
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, DEMO_RECORD, MODE } from "./config.js";
import { canonicalName, openCallerSession, resolveGrantSubject } from "./session.js";

interface VaultReadResponse {
  record_id: string;
  status: "served" | "denied";
  payload?: string;
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

  // --- the function the grant does not name ------------------------
  //
  // Reported, not asserted. On a self-call with no egress the platform
  // has nothing to deny, so this is expected to succeed and saying
  // otherwise would be a false claim in the demo.
  if (MODE === "self") {
    console.log(
      `\nSkipping vault-put. The grant does not name it, but the platform's\n` +
        `enforcement point for a tenant contract is egress, and this contract\n` +
        `makes no outbound call, so on a self-call there is nothing to deny.\n` +
        `Verified: with the grant revoked, the read above still succeeds.\n` +
        `\nThe audit trail is the guarantee that holds here. Enforcement of the\n` +
        `function scope needs a delegated call from a funded second identity.`,
    );
  } else {
    console.log(`\nattempting vault-put, which the grant does not name:`);
    try {
      const smuggled = await call<VaultReadResponse>("vault-put", {
        record_id: "probe-unauthorised",
        payload: "written by a call the grant does not cover",
      });
      console.log(
        `  it SUCCEEDED: ${JSON.stringify(smuggled)}\n` +
          `  So the function list was not enforced on this call either. Treat the\n` +
          `  audit trail, not the function scope, as the guarantee.`,
      );
    } catch (error: unknown) {
      console.log(
        `  refused: ${error instanceof Error ? error.message : String(error)}\n` +
          `  The function scope IS enforced on a delegated call.`,
      );
    }
  }

  console.log(`\nnext: npm run audit`);
}

main().catch((error: unknown) => {
  console.error(`\ninvoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
