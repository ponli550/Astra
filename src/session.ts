/**
 * Session construction. One helper, used identically for all three
 * roles, because on T3N a tenant, an agent and a user are the same
 * kind of session with different keys.
 */
import {
  T3nClient,
  TenantClient,
  createEthAuthInput,
  eth_get_address,
  fetchTrustedManifest,
  getNodeUrl,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
  type WasmComponent,
  type TrustAnchor,
} from "@terminal3/t3n-sdk";
import {
  DECLARED_TENANT_DID,
  DECLARED_USER_DID,
  T3N_ENV,
  hasSeparateOwner,
  keys,
} from "./config.js";

/** Loading the WASM component and the trust anchor is slow, so do it once. */
let shared: Promise<{ wasmComponent: WasmComponent; trustAnchor: TrustAnchor }> | undefined;

function bootstrap() {
  shared ??= (async () => {
    setEnvironment(T3N_ENV);
    const [wasmComponent, trustAnchor] = await Promise.all([
      loadWasmComponent(),
      // Pins the node's attestation. Without it a network attacker with
      // their own trusted-hardware VM can present a valid attestation
      // for a key it controls and read the whole session.
      fetchTrustedManifest(T3N_ENV),
    ]);
    return { wasmComponent, trustAnchor };
  })();
  return shared;
}

export interface Session {
  role: string;
  client: T3nClient;
  did: string;
  address: string;
}

/**
 * Open an authenticated session for one role.
 *
 * The DID is always read back from `authenticate()`. Never derive one
 * from a key or copy one from a config file.
 */
export async function openSession(role: string, privateKey: string): Promise<Session> {
  const { wasmComponent, trustAnchor } = await bootstrap();
  const address = eth_get_address(privateKey);

  const client = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: {
      // The key never leaves this process. It signs a login challenge locally.
      EthSign: metamask_sign(address, undefined, privateKey),
    },
  });

  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(address));

  return { role, client, did: did.value, address };
}

export const openTenantSession = () => openSession("tenant", keys.tenant);
export const openAgentSession = () => openSession("agent", keys.agent);

/**
 * Open a session for the data owner: the identity that grants the agent
 * access, revokes it, and reads its own audit trail.
 *
 * With a third key this is a distinct identity. Without one it is the
 * tenant, which is how the official reference is written. Either way the
 * agent remains separate, and that is the separation the demo rests on.
 */
export const openOwnerSession = () =>
  hasSeparateOwner ? openSession("owner", keys.user) : openSession("owner (tenant)", keys.tenant);

/**
 * Build the control-plane client used to register contracts and create
 * maps.
 *
 * `baseUrl` is passed explicitly on purpose: TenantClient treats it as
 * optional but requests can still fail without it, even after
 * `setEnvironment`.
 */
export async function openTenantClient(): Promise<{ session: Session; tenant: TenantClient }> {
  const session = await openTenantSession();

  if (DECLARED_TENANT_DID && DECLARED_TENANT_DID !== session.did) {
    throw new Error(
      `DID in .env does not match the DID this key authenticates as.\n` +
        `  .env:    ${DECLARED_TENANT_DID}\n` +
        `  session: ${session.did}\n` +
        `The session value is authoritative. Fix .env or use the matching key.`,
    );
  }

  const tenant = new TenantClient({
    t3n: session.client,
    baseUrl: getNodeUrl(),
    tenantDid: session.did,
  });

  // Throws if the DID is not an admitted tenant. Failing here is much
  // clearer than failing later inside register().
  await tenant.tenant.me();

  return { session, tenant };
}

/** Canonical `z:<tid>:<tail>` name for a tenant-owned resource. */
export function canonicalName(tenantDid: string, tail: string): string {
  return `z:${tenantDid.slice("did:t3n:".length)}:${tail}`;
}

/**
 * Resolve the identity whose grant a delegated call is checked against.
 *
 * Prefers the DID declared in the environment, which is what a real
 * agent would receive out of band. Falls back to authenticating with
 * the user's key, which is a demo-only shortcut: a production agent
 * never holds the data owner's key.
 */
export async function resolveGrantSubject(): Promise<string> {
  if (DECLARED_USER_DID) return DECLARED_USER_DID;

  console.warn(
    "USER_DID is not set, so falling back to authenticating as the data owner\n" +
      "to resolve it. A real agent is given this DID out of band and never holds\n" +
      "the owner's key. Run `npm run grant` to get the line to paste.",
  );
  const owner = await openOwnerSession();
  return owner.did;
}
