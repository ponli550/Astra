/**
 * Prove the minted agent can call, and see what consent says about it.
 *
 *   npm run agent:probe
 *
 * One stateless invoke as the agent, authenticating with its bearer
 * token, naming the data owner as the grant subject. Three outcomes:
 *
 *   - a policy denial returned as a normal response: the agent is
 *     funded and can call, and consent simply does not list it yet;
 *   - a served read: it is funded and already listed;
 *   - an InsufficientCredit error: the agent has no balance, and
 *     delegated mode is not available on this account.
 */
import { getContractVersion, getNodeUrl, invoke, setEnvironment } from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL, DECLARED_TENANT_DID, DEMO_RECORD, T3N_ENV } from "./config.js";
import { canonicalName } from "./session.js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Run: npm run agent:mint`);
  return v;
}

async function main() {
  if (!DECLARED_TENANT_DID) throw new Error("DID is not set in .env.");
  setEnvironment(T3N_ENV);
  const apiKey = need("AGENT_API_KEY");
  const agentDid = need("AGENT_DID");
  const subject = process.env["USER_DID"] ?? DECLARED_TENANT_DID;
  const contract = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contract);

  console.log(`agent    ${agentDid}   (bearer token, stateless invoke)`);
  console.log(`subject  ${subject}`);
  console.log(`contract ${contract}@${version}\n`);

  const result = await invoke<{ status: string; reason?: string; audit_key?: string }>({
    baseUrl: getNodeUrl(),
    apiKey,
    request: {
      contract_id: contract,
      contract_version: version,
      function_name: "vault-read",
      pii_did: subject,
      input: { record_id: DEMO_RECORD, purpose: "probe: can a minted agent call at all" },
    },
  });

  console.log(`vault-read: ${result.status}`);
  if (result.reason) console.log(`  reason    ${result.reason}`);
  if (result.audit_key) console.log(`  audit_key ${result.audit_key}`);
  console.log(
    `\nThe call was metered and completed, so the minted agent is funded.\n` +
      (result.status === "denied"
        ? `Consent does not list it yet, which is the correct starting state for\na second party. Grant it with: npm run policy:allow`
        : `Consent already lists it.`),
  );
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`\nprobe failed: ${msg}`);
  if (/InsufficientCredit/i.test(msg)) {
    console.error(
      `The minted agent has no balance. Delegated mode is not available on this\n` +
        `account without a manual credit grant.`,
    );
  }
  process.exit(1);
});
