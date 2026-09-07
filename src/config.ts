/**
 * Environment and identity configuration.
 *
 * Three DISTINCT identities are involved and each needs its own key:
 *
 *   TENANT — owns the contract, the maps and the credits that pay for
 *            registration. This is your developer identity.
 *   AGENT  — the thing acting on a user's behalf. Authenticates as
 *            itself and holds no standing access.
 *   USER   — the data owner. The only principal that can grant the
 *            agent access to the contract.
 *
 * Reusing one key across roles does not work: a metered call is
 * charged to the calling identity's own balance, an agent DID's
 * balance starts at zero, and a self-grant is not the same edge as a
 * user-to-agent grant. Claim one key per identity.
 */
import "dotenv/config";
import type { Environment } from "@terminal3/t3n-sdk";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in. ` +
        `Each identity needs its OWN key from the T3N claim page.`,
    );
  }
  return value.trim();
}

/** A T3N identity key is a 32-byte secp256k1 private key in hex. */
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/**
 * Read a key and check its shape before anything tries to sign with it.
 *
 * Worth doing rather than letting the signer complain: an unfilled
 * placeholder from the template reaches the SDK as a malformed key and
 * comes back as "Invalid Ethereum private key" with the value redacted,
 * which says nothing about which of the three keys is wrong or why.
 */
function requiredKey(name: string): string {
  const value = required(name);

  if (value === "0x..." || /^0x\.+$/.test(value) || /^0x?(your|xxx)/i.test(value)) {
    throw new Error(
      `${name} is still the placeholder from .env.example. Replace it with a real ` +
        `key claimed for this identity from the T3N claim page.`,
    );
  }

  if (!PRIVATE_KEY.test(value)) {
    const hint = value.startsWith("0x")
      ? `it is ${value.length} characters; a key is 66, being "0x" plus 64 hex digits`
      : `it does not start with "0x"`;
    throw new Error(`${name} is not a valid private key: ${hint}.`);
  }

  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** Which T3N network to talk to. */
export const T3N_ENV = (optional("T3N_ENV") ?? "testnet") as Environment;

/**
 * Local name of the contract inside the tenant namespace. The host
 * stores it as `z:<tid>:<tail>`. Keep it short: the full canonical
 * name is reused in delegation grants, where length limits are
 * stricter than at registration.
 */
export const CONTRACT_TAIL = optional("CONTRACT_TAIL") ?? "consent-vault";

/**
 * Bump this on every re-register. A version that is not strictly
 * higher than the deployed one is refused.
 */
export const CONTRACT_VERSION = optional("CONTRACT_VERSION") ?? "0.4.1";

/** Built by `npm run contract:build`. */
export const WASM_PATH =
  optional("WASM_PATH") ?? "contract/target/wasm32-wasip2/release/z_tenant_consent.wasm";

export const VAULT_MAP_TAIL = "vault";
export const AUDIT_MAP_TAIL = "audit";
export const POLICY_MAP_TAIL = "policy";

/** How long the user's grant to the agent stays valid, in seconds. */
export const GRANT_TTL_SECS = Number(optional("GRANT_TTL_SECS") ?? "900");

export const keys = {
  /**
   * Tenant developer key. Owns the contract and pays to register it,
   * and acts as the data owner unless a separate owner key is set.
   */
  get tenant(): string {
    return requiredKey("T3N_API_KEY");
  },
  /**
   * A separate agent key. Optional; see `MODE`.
   *
   * Never the tenant's. When a distinct funded agent identity exists,
   * this is what makes the demo show delegation to a second party.
   */
  get agent(): string {
    return requiredKey("AGENT_KEY");
  },
  /** A separate data owner key. Optional; see `hasSeparateOwner`. */
  get user(): string {
    return requiredKey("USER_KEY");
  },
};

/** True when the variable holds a real value rather than a template stub. */
function filled(name: string): boolean {
  const value = optional(name);
  if (value === undefined) return false;
  if (value === "0x..." || /^0x\.+$/.test(value)) return false;
  return true;
}

/**
 * Whether a third identity acts as the data owner.
 *
 * The claim page issues one key and one DID per work email, so extra
 * identities mean extra addresses. When there is no owner key the tenant
 * plays that role, which is how the official reference is written: it
 * runs its grant as the tenant and sets the grant subject to the
 * tenant's identity.
 */
export const hasSeparateOwner = ((): boolean => {
  if (!filled("USER_KEY")) return false;
  return optional("USER_KEY") !== optional("T3N_API_KEY");
})();

/**
 * Whether a separate agent identity makes the calls.
 *
 * A key that merely repeats another role's key is not a separate
 * identity. Pasting the one claimed key into every slot is the natural
 * thing to do when the claim page gave you one, so it is treated as
 * "no separate agent" rather than reported as a mistake.
 *
 * A locally generated keypair is not a substitute either. It
 * authenticates and the network mints a DID for it, but it starts with
 * zero credits, and the host bills a delegated call to the
 * authenticated caller rather than to the subject. So an unfunded agent
 * fails every call on credit before consent is ever consulted, which
 * looks like broken guardrails rather than a funding problem.
 */
export const hasSeparateAgent = ((): boolean => {
  if (!filled("AGENT_KEY")) return false;
  const agent = optional("AGENT_KEY");
  return agent !== optional("T3N_API_KEY") && agent !== optional("USER_KEY");
})();

/**
 * How the demo runs.
 *
 * `delegated` needs a second funded identity and shows an agent
 * receiving exactly what it was granted.
 *
 * `self` runs on one identity, which grants itself. The platform
 * documents this for direct calls: the grantee is the caller's own
 * identity. It still shows that the contract refuses an unattributable
 * call, that every attempt is recorded with provenance set inside the
 * enclave, and that the grant is load-bearing, because withdrawing it
 * stops calls that worked a moment earlier. What it cannot show is a
 * second party that started with no access.
 */
export const MODE: "delegated" | "self" = hasSeparateAgent ? "delegated" : "self";

/** One-line description of the arrangement, for scripts to print. */
export function describeMode(): string {
  if (MODE === "delegated") {
    return hasSeparateOwner
      ? "delegated, with a separate data owner and agent"
      : "delegated, tenant acts as the data owner";
  }
  return "self-grant, one identity is tenant, data owner and caller";
}

/** Vault record the deploy step seeds and the invoke step reads back. */
export const DEMO_RECORD = "medical-1";

/**
 * The identity whose grant a delegated call is checked against.
 *
 * This is the single most important field on an invocation and the
 * easiest to omit. A call that does not name a subject is treated as a
 * self-call by the caller's own identity, so the node looks up the
 * caller's own grants instead of the grants the data owner signed. It
 * surfaces as a permission or egress denial that reads like a
 * misconfigured allowlist, while the real problem is that the lookup
 * subject is wrong. Grant read-backs look correct throughout, because a
 * diagnostic read is authenticated as the granting identity and
 * therefore checks the right place.
 *
 * `npm run grant` prints the line to set here.
 */
export const DECLARED_USER_DID = optional("USER_DID");

/**
 * A contract id from an earlier deploy.
 *
 * Registration returns the id, but nothing looks it up afterwards. When
 * the current version is already registered, this is the only way a
 * later run can re-point map rules at the right contract.
 */
export const KNOWN_CONTRACT_ID = ((): number | undefined => {
  const raw = optional("CONTRACT_ID");
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CONTRACT_ID must be a positive integer, got "${raw}".`);
  }
  return parsed;
})();

/**
 * The tenant DID from the environment, used to name the contract and to
 * cross-check the value the session returns. The session is always the
 * source of truth: a hardcoded or hand-derived DID is the most common
 * cause of `tenant not found`.
 */
export const DECLARED_TENANT_DID = optional("DID");
