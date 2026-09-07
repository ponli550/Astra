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
export const CONTRACT_VERSION = optional("CONTRACT_VERSION") ?? "0.2.0";

/** Built by `npm run contract:build`. */
export const WASM_PATH =
  optional("WASM_PATH") ?? "contract/target/wasm32-wasip2/release/z_tenant_consent.wasm";

export const VAULT_MAP_TAIL = "vault";
export const AUDIT_MAP_TAIL = "audit";

/** How long the user's grant to the agent stays valid, in seconds. */
export const GRANT_TTL_SECS = Number(optional("GRANT_TTL_SECS") ?? "900");

export const keys = {
  /** Tenant developer key. Owns the contract and pays to register it. */
  get tenant(): string {
    return requiredKey("T3N_API_KEY");
  },
  /** The agent's own key. Never the tenant's. */
  get agent(): string {
    return requiredKey("AGENT_KEY");
  },
  /** The data owner's key. Stands in for a real user in this demo. */
  get user(): string {
    return requiredKey("USER_KEY");
  },
};

/**
 * The tenant DID from `.env`, used only to cross-check the value the
 * session returns. The session is always the source of truth: a
 * hardcoded or hand-derived DID is the most common cause of
 * `tenant not found`.
 */
export const DECLARED_TENANT_DID = optional("DID");

/** Vault record the deploy step seeds and the invoke step reads back. */
export const DEMO_RECORD = "medical-1";

/**
 * The identity whose grant a delegated call is checked against.
 *
 * This is the single most important field on an invocation and the
 * easiest to omit. A call that does not name a subject is treated as a
 * self-call by the caller's own identity, so the node looks up the
 * agent's own grants, which are empty, instead of the grants the data
 * owner signed. It surfaces as a permission or egress denial that reads
 * like a misconfigured allowlist, while the real problem is that the
 * lookup subject is wrong. Grant read-backs look correct throughout,
 * because a diagnostic read is authenticated as the granting identity
 * and therefore checks the right place.
 *
 * In this project the data owner is the user, so the subject is the
 * user's DID. `npm run grant` prints the line to paste here.
 *
 * A production agent receives this DID out of band and never holds the
 * user's key. When it is absent, the demo scripts fall back to
 * authenticating with `USER_KEY` purely to resolve it, and say so.
 */
export const DECLARED_USER_DID = optional("USER_DID");
