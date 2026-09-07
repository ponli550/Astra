/**
 * Consent. Authorises the caller for exactly the functions it needs on
 * exactly one contract, for a bounded window.
 *
 *   npm run grant
 *
 * Signed by the DATA OWNER. Nothing the tenant or the caller can do
 * substitutes for it. Without a matching grant the caller is still a
 * valid authenticated identity, it just cannot invoke the function.
 */
import { getContractVersion, getNodeUrl, type BoundGrant } from "@terminal3/t3n-sdk";
import {
  CONTRACT_TAIL,
  DECLARED_TENANT_DID,
  GRANT_TTL_SECS,
  MODE,
  describeMode,
} from "./config.js";
import { openCaller } from "./caller.js";
import { canonicalName, openOwnerSession } from "./session.js";

/**
 * Functions the platform grant names. Read-only by default; override with
 * GRANT_FUNCTIONS="vault-read,audit-list,policy-delegate" for an agent
 * that is allowed to hand permission on.
 *
 * This is the PLATFORM layer. On a delegated call, where the caller is
 * not the subject, the node checks this grant per function before the
 * contract runs and refuses with agent_auth_not_found. It is flat: only
 * the owner can issue it, so the chain lives in the contract's policy on
 * top of it. Both layers must pass.
 */
export const GRANTED_FUNCTIONS = (process.env["GRANT_FUNCTIONS"] ?? "vault-read,audit-list")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

/** Functions deliberately withheld, so the scope is observably real. */
export const WITHHELD_FUNCTIONS = ["vault-put"];

/** The read the owner's console depends on. */
export const AUDIT_FUNCTION = "audit-list";

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  // The caller's DID can only be learned by authenticating as it.
  // CALLER=second selects agent B as the grantee.
  const caller = await openCaller();
  const owner = await openOwnerSession();

  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);
  const selfGrant = caller.did === owner.did;

  const now = Math.floor(Date.now() / 1000);
  const grant: BoundGrant = {
    grantee: caller.did,
    contract_id: contractName,
    functions: GRANTED_FUNCTIONS,
    // No org-data scopes and no egress: this contract reads only the
    // tenant's own maps and makes no outbound call.
    scopes: [],
    allowed_hosts: [],
    // Unpinned by default. A grant pinned to the exact version at issue
    // time silently stops matching on the next redeploy, and every
    // delegated call then fails before dispatch with agent_auth_not_found.
    // The reference demo grants unpinned for this reason. Set
    // GRANT_PIN_VERSION=1 to pin deliberately.
    ...(process.env["GRANT_PIN_VERSION"] ? { version_req: version } : {}),
    // The short-lived part. Expiry is enforced by the host at read
    // time, so the grant stops working on its own.
    window: {
      valid_from_secs: now,
      valid_until_secs: now + GRANT_TTL_SECS,
    },
  };

  console.log(`mode      ${describeMode()}`);
  console.log(`owner     ${owner.did}   (signing this grant)`);
  console.log(`caller    ${caller.did}   (being authorised)`);
  console.log(`contract  ${contractName}@${version}`);
  console.log(`functions ${GRANTED_FUNCTIONS.join(", ")}`);
  console.log(`withheld  ${WITHHELD_FUNCTIONS.join(", ")}`);
  console.log(
    `expires   ${new Date((now + GRANT_TTL_SECS) * 1000).toISOString()} (${GRANT_TTL_SECS}s)`,
  );

  // Read-merge-write on the (grantee, contract) pair, so grants this
  // owner has given for other contracts survive. The lower-level
  // document write replaces the whole policy instead, which silently
  // revokes everything not restated.
  const { preservedRows } = await owner.client.updateMemberDelegation(grant);
  console.log(`\ngrant written.`);
  if (preservedRows.length > 0) {
    console.log(`preserved existing grants:`);
    for (const row of preservedRows) console.log(`  ${row}`);
  }

  if (selfGrant) {
    // One identity, so there is only one grant row to hold. A second
    // write for the console's read would target the same
    // (grantee, contract) pair and REPLACE this one rather than sit
    // beside it, silently dropping the vault read.
    //
    // The consequence to be honest about: revoking in this mode also
    // withdraws the console's own read, because it is the same identity
    // withdrawing its own access. That is a limitation of running on one
    // funded identity, not a defect.
    console.log(
      `\nself-grant: the single identity is both owner and caller, so the\n` +
        `console reads the trail through this same grant. Revoking therefore\n` +
        `withdraws the console's read too.`,
    );
  } else {
    // Distinct identities, so the owner keeps a grant of its own. Without
    // it the console would read the trail through the agent's grant, and
    // revoking the agent would blind the very console you revoke from.
    //
    // No window: a data owner's access to the record of who touched
    // their data should not expire on a timer.
    const ownerGrant: BoundGrant = {
      grantee: owner.did,
      contract_id: contractName,
      functions: [AUDIT_FUNCTION],
      scopes: [],
      allowed_hosts: [],
      ...(process.env["GRANT_PIN_VERSION"] ? { version_req: version } : {}),
    };
    await owner.client.updateMemberDelegation(ownerGrant);
    console.log(`self-grant written for the owner's console: ${AUDIT_FUNCTION}`);
  }

  const doc = await owner.client.getMemberDelegation();
  const rows = doc.grants.filter((g) => g.contract_id === contractName);
  console.log(`\nreadback: ${rows.length} grant row(s) on this contract`);
  for (const row of rows) {
    const until = row.window?.valid_until_secs;
    console.log(
      `  ${row.grantee === caller.did ? "caller" : "owner "} ` +
        `[${row.functions.join(", ")}] ` +
        `until=${until === undefined ? "no expiry" : new Date(until * 1000).toISOString()}`,
    );
  }

  console.log(
    `\nAdd this line to .env so the scripts name the right grant subject:\n` +
      `  USER_DID=${owner.did}\n` +
      `Without it a delegated call is checked against the caller's own grants\n` +
      `and the denial reads like a misconfigured allowlist.`,
  );

  if (MODE === "self") {
    console.log(
      `\nNote: this run shows that the grant is load-bearing, because\n` +
        `withdrawing it stops calls that worked a moment earlier. It does not\n` +
        `show a second party receiving access it did not have, which needs a\n` +
        `funded agent identity.`,
    );
  }

  console.log(`\nnext: npm run invoke`);
}

main().catch((error: unknown) => {
  console.error(`\ngrant failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
