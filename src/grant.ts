/**
 * Consent. The data owner authorises the agent to call exactly two
 * functions on exactly one contract, for a bounded window.
 *
 *   npm run grant
 *
 * This is signed by the USER, not by the agent and not by the tenant.
 * Nothing the tenant or the agent can do substitutes for it. Without a
 * matching grant the agent is still a valid authenticated identity, it
 * just cannot invoke the function.
 */
import { getContractVersion, getNodeUrl, type BoundGrant } from "@terminal3/t3n-sdk";
import {
  CONTRACT_TAIL,
  DECLARED_TENANT_DID,
  GRANT_TTL_SECS,
} from "./config.js";
import { canonicalName, openAgentSession, openOwnerSession } from "./session.js";

/** Functions the agent is allowed to call. Read-only, deliberately. */
export const GRANTED_FUNCTIONS = ["vault-read", "audit-list"];

/** Functions the agent is NOT granted, used to show the scope is real. */
export const WITHHELD_FUNCTIONS = ["vault-put"];

/**
 * The read the owner self-grants so their own console keeps working
 * after the agent's grant is revoked.
 */
export const AUDIT_FUNCTION = "audit-list";

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  // The agent DID can only be learned by authenticating as the agent.
  // Never hardcode or derive it.
  const agent = await openAgentSession();
  const user = await openOwnerSession();

  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);

  const now = Math.floor(Date.now() / 1000);
  const grant: BoundGrant = {
    grantee: agent.did,
    contract_id: contractName,
    functions: GRANTED_FUNCTIONS,
    // No org-data scopes and no egress: this contract reads only the
    // tenant's own maps and makes no outbound call.
    scopes: [],
    allowed_hosts: [],
    version_req: version,
    // The short-lived part. Expiry is enforced by the host at read
    // time, so the grant stops working on its own.
    window: {
      valid_from_secs: now,
      valid_until_secs: now + GRANT_TTL_SECS,
    },
  };

  console.log(`user      ${user.did}   (signing this grant)`);
  console.log(`agent     ${agent.did}   (being authorised)`);
  console.log(`contract  ${contractName}@${version}`);
  console.log(`functions ${GRANTED_FUNCTIONS.join(", ")}`);
  console.log(`withheld  ${WITHHELD_FUNCTIONS.join(", ")}`);
  console.log(
    `expires   ${new Date((now + GRANT_TTL_SECS) * 1000).toISOString()} ` +
      `(${GRANT_TTL_SECS}s)`,
  );

  // Read-merge-write on the (grantee, contract) pair, so grants this
  // user has given for other contracts survive. The lower-level
  // document write replaces the whole policy instead, which silently
  // revokes everything not restated.
  const { preservedRows } = await user.client.updateMemberDelegation(grant);

  // The owner also grants themselves read access to their own audit
  // trail. Without this the monitor would have to read the trail through
  // the agent's grant, so revoking the agent would blind the very
  // console you revoke from. The owner's console must not depend on the
  // authority it can withdraw.
  //
  // No window: the data owner's access to their own record of who
  // touched their data should not expire on a timer.
  const ownerGrant: BoundGrant = {
    grantee: user.did,
    contract_id: contractName,
    functions: [AUDIT_FUNCTION],
    scopes: [],
    allowed_hosts: [],
    version_req: version,
  };
  await user.client.updateMemberDelegation(ownerGrant);
  console.log(`\nself-grant written for the owner's console: ${AUDIT_FUNCTION}`);

  console.log(`\ngrant written.`);
  if (preservedRows.length > 0) {
    console.log(`preserved existing grants:`);
    for (const row of preservedRows) console.log(`  ${row}`);
  }

  const doc = await user.client.getMemberDelegation();
  const mine = doc.grants.filter((g) => g.grantee === agent.did);
  console.log(`\nreadback: ${mine.length} grant row(s) for this agent`);
  for (const g of mine) {
    console.log(`  ${g.contract_id} functions=[${g.functions.join(", ")}] until=${g.window?.valid_until_secs ?? "unbounded"}`);
  }

  console.log(
    `\nAdd this line to .env so the agent scripts name the right grant subject:\n` +
      `  USER_DID=${user.did}\n` +
      `Without it a delegated call is checked against the agent's own grants,\n` +
      `which are empty, and the denial reads like a misconfigured allowlist.`,
  );

  console.log(`\nnext: npm run invoke`);
}

main().catch((error: unknown) => {
  console.error(`\ngrant failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
