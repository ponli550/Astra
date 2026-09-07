/**
 * The action. The agent reads a gated record, and the read produces an
 * audit entry it cannot suppress.
 *
 *   npm run invoke
 *
 * Also attempts a function the grant withholds, to show the scope is
 * enforced rather than advisory. That failure is the expected result,
 * not a problem with the run.
 */
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, DEMO_RECORD } from "./config.js";
import { canonicalName, openAgentSession } from "./session.js";

interface VaultReadResponse {
  record_id: string;
  payload: string;
  audit_key: string;
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const agent = await openAgentSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);

  console.log(`agent    ${agent.did}`);
  console.log(`contract ${contractName}@${version}\n`);

  // --- granted call ------------------------------------------------
  const read = await agent.client.executeAndDecode<VaultReadResponse>({
    contract_id: contractName,
    contract_version: version,
    function_name: "vault-read",
    input: {
      record_id: DEMO_RECORD,
      purpose: "demo: agent retrieving a record under delegated consent",
    },
  });

  console.log(`vault-read OK`);
  console.log(`  record    ${read.record_id}`);
  console.log(`  payload   ${read.payload}`);
  console.log(`  audit_key ${read.audit_key}`);
  console.log(`\nThe payload could not be returned without writing that audit entry:`);
  console.log(`both happen in one transaction, so a read that is not recorded`);
  console.log(`cannot commit.`);

  // --- withheld call, expected to fail -----------------------------
  console.log(`\nattempting vault-put, which the grant does NOT cover:`);
  try {
    await agent.client.executeAndDecode({
      contract_id: contractName,
      contract_version: version,
      function_name: "vault-put",
      input: { record_id: "smuggled-1", payload: "should never be written" },
    });
    console.error(
      `  UNEXPECTED: vault-put succeeded. The grant should not authorise it — ` +
        `check whether a wider grant is still in place for this agent.`,
    );
    process.exitCode = 1;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`  refused as expected: ${detail}`);
  }

  console.log(`\nnext: npm run audit`);
}

main().catch((error: unknown) => {
  console.error(`\ninvoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
