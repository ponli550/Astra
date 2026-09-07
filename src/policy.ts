/**
 * Consent policy administration. This is the gate that is actually
 * enforced.
 *
 *   npm run policy          # show what is in force
 *   npm run policy:allow    # permit the caller to read, time-boxed
 *   npm run policy:deny     # withdraw consent
 *
 * The delegation grant does not gate this contract, because the
 * platform's enforcement point is egress and this contract makes no
 * outbound call. So the contract checks the policy itself, against
 * values the node mints: the calling identity from tenant context, and
 * the cluster-pinned clock. A caller cannot claim to be someone else
 * and cannot move an expiry.
 *
 * Only the tenant identity may read or change the policy, checked the
 * same way inside the enclave.
 */
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import {
  CONTRACT_TAIL,
  DECLARED_TENANT_DID,
  GRANT_TTL_SECS,
} from "./config.js";
import { openCaller } from "./caller.js";
import { canonicalName, openTenantSession } from "./session.js";

/** Functions consent covers when permitted. Read-only, deliberately. */
export const ALLOWED_FUNCTIONS = ["vault-read", "audit-list"];

/** Deliberately outside consent, so the gate is observably real. */
export const WITHHELD_FUNCTIONS = ["vault-put"];

interface Delegation {
  from: string;
  to: string;
  functions: string[];
  valid_until_secs: number | null;
}

interface PolicyView {
  version: number;
  allowed_callers: string[];
  allowed_functions: string[];
  valid_until_secs: number | null;
  delegations?: Delegation[];
  now_secs: number;
  expired: boolean;
}

interface PolicySetResult {
  version: number;
  allowed_callers: string[];
  allowed_functions: string[];
  valid_until_secs: number | null;
  audit_key: string;
}

/** Strip the `did:t3n:` prefix; the policy stores the 40 hex body. */
function didBody(did: string): string {
  return did.startsWith("did:t3n:") ? did.slice("did:t3n:".length) : did;
}

function describe(view: PolicyView): void {
  console.log(`policy version ${view.version}`);
  if (view.version === 0) {
    console.log(`  nothing in force, so every call is denied`);
    return;
  }
  console.log(
    `  callers   ${view.allowed_callers.length > 0 ? view.allowed_callers.join(", ") : "(none, so everyone is denied)"}`,
  );
  console.log(
    `  functions ${view.allowed_functions.length > 0 ? view.allowed_functions.join(", ") : "(none)"}`,
  );
  if (view.valid_until_secs === null) {
    console.log(`  expiry    none`);
  } else {
    const left = view.valid_until_secs - view.now_secs;
    console.log(
      `  expiry    ${new Date(view.valid_until_secs * 1000).toISOString()}` +
        ` (${view.expired ? "lapsed" : `${left}s left`})`,
    );
  }
  console.log(`  cluster time ${new Date(view.now_secs * 1000).toISOString()}`);
  const chain = view.delegations ?? [];
  if (chain.length > 0) {
    console.log(`  chain`);
    for (const d of chain) {
      const until = d.valid_until_secs === null ? "no expiry" : new Date(d.valid_until_secs * 1000).toISOString();
      console.log(`    ${d.from.slice(0, 8)}... -> ${d.to.slice(0, 8)}...  [${d.functions.join(", ")}]  until ${until}`);
    }
    console.log(`    each hop holds the intersection with what its delegator still holds`);
  }
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const action = (process.argv[2] ?? "show").toLowerCase();
  const tenant = await openTenantSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);
  const version = await getContractVersion(getNodeUrl(), contractName);

  const call = <T,>(functionName: string, input: unknown) =>
    tenant.client.executeAndDecode<T>({
      contract_id: contractName,
      contract_version: version,
      function_name: functionName,
      pii_did: tenant.did,
      input,
    });

  console.log(`contract ${contractName}@${version}\n`);

  if (action === "show") {
    describe(await call<PolicyView>("policy-get", {}));
    console.log(`\nchange it with: npm run policy:allow | npm run policy:deny`);
    return;
  }

  if (action === "allow") {
    const caller = await openCaller();
    const until = Math.floor(Date.now() / 1000) + GRANT_TTL_SECS;
    const result = await call<PolicySetResult>("policy-set", {
      allowed_callers: [didBody(caller.did)],
      allowed_functions: ALLOWED_FUNCTIONS,
      valid_until_secs: until,
    });
    console.log(`consent granted, policy version ${result.version}`);
    console.log(`  caller    ${caller.did}   (${caller.role})`);
    console.log(`  functions ${result.allowed_functions.join(", ")}`);
    console.log(`  withheld  ${WITHHELD_FUNCTIONS.join(", ")}`);
    console.log(`  expires   ${new Date(until * 1000).toISOString()} (${GRANT_TTL_SECS}s)`);
    console.log(`  audit_key ${result.audit_key}`);
    console.log(
      `\nThe change is itself in the audit trail, so widening permission is\n` +
        `as visible as using it.`,
    );
    console.log(`\nnext: npm run invoke`);
    return;
  }

  if (action === "deny") {
    // An empty caller list is the honest encoding of withdrawn consent:
    // the document still exists and still has a version, so the trail
    // shows a deliberate withdrawal rather than an absent policy.
    const result = await call<PolicySetResult>("policy-set", {
      allowed_callers: [],
      allowed_functions: [],
      valid_until_secs: null,
    });
    console.log(`consent withdrawn, policy version ${result.version}`);
    console.log(`  audit_key ${result.audit_key}`);
    console.log(
      `\nEvery gated call now fails inside the enclave, with no redeploy.\n` +
        `Verify with: npm run invoke`,
    );
    return;
  }

  throw new Error(`unknown action "${action}". Use show, allow or deny.`);
}

main().catch((error: unknown) => {
  console.error(`\npolicy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
