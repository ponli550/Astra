/**
 * The action. The agent reads a gated record, and the attempt produces
 * an audit entry it cannot suppress.
 *
 *   npm run invoke
 *
 * Three calls, and only the first is expected to return a payload:
 *
 *   1. Read the seeded record. Served, and audited.
 *   2. Read a record that does not exist. Denied, and still audited,
 *      because the contract returns a denial as a successful response.
 *   3. Call a function the grant withholds. Refused by the node before
 *      the contract runs, so there is nothing to audit.
 */
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, DEMO_RECORD } from "./config.js";
import { canonicalName, openAgentSession, resolveGrantSubject } from "./session.js";

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

  const agent = await openAgentSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);

  // Whose grant this call is checked against. Omitting it makes the node
  // check the agent's own grants, which are empty, and the resulting
  // denial reads like a misconfigured allowlist.
  const subject = await resolveGrantSubject();

  console.log(`agent    ${agent.did}`);
  console.log(`subject  ${subject}   (whose grant authorises this)`);
  console.log(`contract ${contractName}@${version}\n`);

  const call = <T,>(functionName: string, input: unknown) =>
    agent.client.executeAndDecode<T>({
      contract_id: contractName,
      contract_version: version,
      function_name: functionName,
      pii_did: subject,
      input,
    });

  // --- 1. granted read of a record that exists ---------------------
  const served = await call<VaultReadResponse>("vault-read", {
    record_id: DEMO_RECORD,
    purpose: "demo: agent retrieving a record under delegated consent",
  });
  console.log(`vault-read ${DEMO_RECORD}: ${served.status}`);
  console.log(`  payload   ${served.payload ?? "(none)"}`);
  console.log(`  audit_key ${served.audit_key}`);
  if (served.status !== "served") {
    console.warn(`  expected this read to be served, got ${served.status}: ${served.reason}`);
    process.exitCode = 1;
  }

  // --- 2. granted read of a record that does not exist -------------
  const denied = await call<VaultReadResponse>("vault-read", {
    record_id: "does-not-exist",
    purpose: "demo: showing a denial is recorded too",
  });
  console.log(`\nvault-read does-not-exist: ${denied.status}`);
  console.log(`  reason    ${denied.reason ?? "(none)"}`);
  console.log(`  audit_key ${denied.audit_key}`);
  console.log(
    `\nThat denial kept its audit entry. The host rolls back everything a call\n` +
      `wrote if the call returns an error, so a denial raised as an error would\n` +
      `have erased its own record and left a trail of successes only.`,
  );

  // --- 3. withheld function, refused before the contract runs ------
  console.log(`\nattempting vault-put, which the grant does NOT cover:`);
  try {
    await call("vault-put", { record_id: "smuggled-1", payload: "should never be written" });
    console.error(
      `  UNEXPECTED: vault-put succeeded. Check whether a wider grant is still ` +
        `in place for this agent.`,
    );
    process.exitCode = 1;
  } catch (error: unknown) {
    console.log(`  refused as expected: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`\nnext: npm run audit`);
}

main().catch((error: unknown) => {
  console.error(`\ninvoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
