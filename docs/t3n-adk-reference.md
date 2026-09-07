
You are free to build anything that best showcases the capabilities of the T3N ADK (e.g., verifiable agent identity, privacy-preserving KYC workflows, multi-agent consent chains, or secure data vaults).

Example build tracks (adapt as needed) - Can choose your own as well

Agent with verifiable identity for actions
Authenticate an agent to perform a user-approved action (e.g., fetch account data, initiate a request) only when a valid, verifiable credential is presented.
Selective-disclosure KYC gate for an agent workflow
Let a user prove an attribute (age ≥ 18, residency, role) without exposing full identity, then route the agent’s next step accordingly.
Signed agent-to-agent handoff
Have two agents exchange verifiable proofs to coordinate a task, with logs that demonstrate who did what and when.
Private data access with auditable consent
Gate a read on sensitive data using a short-lived credential and produce an audit record of the consent and access.
Each track can be scoped to a small demo: one flow, a clear credential check, and an observable action.
cryptographical, scoped,

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# What is T3 Agent Developer Kit (ADK)?

> An SDK suite that allows developers to build safe and secure AI agents

## Overview

T3 Agent Developer Kit (ADK) is a client SDK that allows developers to build agent tenant applications on the [T3 Network (T3N)](/t3n/overview/what-is-t3n). It lets developers onboard an agent tenant identity, manage tenant-scoped data and [TEE contracts](/t3n/how-t3n-works/tees#tee-contract), and execute TEE contracts inside T3N.

<Note>
  The current SDK only supports **TypeScript** / **JavaScript**. Support for more languages is coming soon.
</Note>

## Key Capabilities

| Capability                            | What it does                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated session                 | `T3nClient.authenticate()` signs in with your Ethereum wallet and opens an encrypted channel to the [TEE node](/t3n/how-t3n-works/tees) — your `tenantDid` comes back from this call, never derived by hand.           |
| Tenant setup (`TenantClient`)         | Built around your already-authenticated `tenantDid`; `tenant.tenant.me()` confirms it's wired up correctly.                                                                                                            |
| Tenant data (`tenant.maps`)           | `tenant.maps.create()` creates key-value maps under your private `z:<tid>:…` prefix, with explicit `readers`/`writers` access rules per map.                                                                           |
| Tenant contracts (`tenant.contracts`) | `tenant.contracts.register()` uploads a Rust→WASM contract and gives it a tenant-local name; registering a new `version` at the same tail allocates a new `contract_id` rather than replacing the old one.             |
| Invoking a contract                   | An authenticated agent or user client calls `executeAndDecode()` (or `execute()`) with `contract_id`/`contract_version`/`function_name`/`input` — the same pattern whether you're calling as a tenant, agent, or user. |
| Hardware-enforced isolation           | Every read and write is checked against your tenant prefix inside T3N — no ACL to misconfigure.                                                                                                                        |

See the [Quickstart](/developers/adk/get-started/quickstart) and [Reference](/developers/adk/reference) for the exact method signatures — this page is a conceptual map, not the API surface itself.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Why T3 ADK?

> Give AI agents real-world capabilities without compromising user privacy, security and compliance

T3 Agent Developer Kit (ADK) helps developers build AI agents that can securely identify themselves, access user-authorized data, and perform real-world actions on behalf of users—without exposing sensitive information to the model, application, or agent runtime.

With the ADK, developers can:

* **Build faster** using pre-built infrastructure for identity, confidential computing, secure data access, and agent governance.
* **Protect user privacy by design** by keeping sensitive data out of prompts, context windows, and application servers.
* **Reduce compliance burden** with architecture designed to support privacy and regulatory requirements such as GDPR.
* **Enable trusted agent actions** including transactions, approvals, and interactions with external services using verifiable permissions and auditability.
* **Connect to a network of users and agents** through portable identities and verifiable credentials that work across applications and ecosystems.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# ADK Tour

> The shape of the ADK in five pieces, before you write any code.

If you're new here, this page is the map. It won't teach you to build anything — [Quickstart](/developers/adk/get-started/quickstart) does that in under 10 minutes — but it'll save you from guessing what each piece is for while you read the rest of the docs.

The ADK is built around five ideas. Everything else in these docs is a detail of one of these.

<Steps>
  <Step title="You are a tenant">
    When you sign in and get an API key, T3N gives you a **tenant identity** — an opaque ID (`did:t3n:...`) that everything you own is scoped to: your data, your contracts, your credits. It's not derived from your wallet, and you never construct it yourself — you always read it back from an authenticated session.
  </Step>

  <Step title="Your data lives in a private map, by default">
    Anything you store (an API key, a config value, application state) goes into a **tenant KV map**, namespaced under your tenant ID so no other tenant can ever read or write it. Access within your own maps is opt-in — you explicitly say what a contract is allowed to touch. See [Create Tenant KV Maps](/developers/adk/tips/create-kv-maps).
  </Step>

  <Step title="Logic that touches sensitive data runs as a TEE contract">
    A **TEE contract** is a small Rust program, compiled to WebAssembly, that runs inside confidential-computing hardware (a TEE). The point of running it there instead of on your own server: the contract can process user PII and call third-party APIs on a user's behalf, without your infrastructure — or you — ever seeing the plaintext. See [Write your first TEE contract](/developers/adk/get-started/walkthrough/write-contract).
  </Step>

  <Step title="Agents act on delegated permission, not blanket trust">
    An AI agent doesn't get standing access to anything. A user (or you, acting on your own tenant) explicitly grants an agent permission to call specific functions on a specific contract, optionally scoped to specific external hosts it's allowed to reach. No grant, no access — the contract still runs, the outbound call just gets denied. See [Agent Auth](/developers/adk/overview/agent-auth-adk).
  </Step>

  <Step title="PII moves through the enclave, never through your code">
    When a contract needs to send a user's real name, email, or other personal data to a third-party API, it doesn't handle that data directly. It sends a request with `{{profile.field}}` placeholder markers, and the host substitutes the real values inside the enclave at the last moment. Your contract — and anything logging or inspecting it — only ever sees the placeholder. See [Placeholders in outbound calls](/developers/adk/tips/placeholders-outbound-calls).
  </Step>
</Steps>

## Where to go next

<CardGroup cols={2}>
  <Card title="Quickstart" icon="bolt" href="/developers/adk/get-started/quickstart">
    Get an authenticated call working in under 10 minutes.
  </Card>

  <Card title="Write your first TEE contract" icon="file-code" href="/developers/adk/get-started/walkthrough/write-contract">
    The full walkthrough, with a real worked example.
  </Card>

  <Card title="Agent Auth" icon="key" href="/developers/adk/overview/agent-auth-adk">
    How agents authenticate and get delegated permission.
  </Card>

  <Card title="Common Errors" icon="triangle-exclamation" href="/developers/adk/tips/common-errors">
    Bookmark this one — you'll want it.
  </Card>
</CardGroup>

refer > ## Documentation Index
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Set Up Development Environment

> Two more steps to get ready for writing your first TEE contract.

<Note>
  This page picks up where [Quickstart](/developers/adk/get-started/quickstart) leaves off. Complete that first — you should already have an authenticated `T3nClient` and your `tenantDid` before starting here.
</Note>

<Steps>
  <Step title="Get your API key and DID">
    If you haven't already, get your DID, download your API key, and claim test credits  from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) — it's self-serve, no approval needed.
  </Step>

  <Step title="Install Rust + WASM toolchain">
    [TEE contracts](/t3n/how-t3n-works/tees#tee-contract) are compiled to WebAssembly (WASM) binaries, built with the Rust toolchain.

    If you don't already have `rustup`/`cargo` installed:

    ```bash theme={null}
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # choose the default option when prompted
    source "$HOME/.cargo/env"
    ```

    Then add the WASM target:

    ```bash theme={null}
    rustup target add wasm32-wasip2          # WASI Preview 2 build target — a few seconds
    cargo install wasm-tools                 # optional — inspect/verify the component
    ```

    <Note>
      `cargo install wasm-tools` compiles roughly 100 crates from source and takes about 2 minutes with no progress output in between — that's normal, not a hang.
    </Note>
  </Step>

  <Step title="Build a TenantClient from your session">
    Contracts are registered and managed through a `TenantClient`, built around the `tenantDid` you already obtained in Quickstart — never construct or derive this value yourself.

    Append this to the bottom of the same `quickstart.ts` you created in Quickstart — it needs `t3n` and `tenantDid` from that file's scope:

    ```typescript theme={null}
    import { TenantClient, getNodeUrl } from "@terminal3/t3n-sdk";

    const tenant = new TenantClient({
      t3n,                    // the T3nClient you already authenticated in Quickstart
      baseUrl: getNodeUrl(),  // the active node from setEnvironment()
      tenantDid,               // did.value from Quickstart — never hardcode
    });

    await tenant.tenant.me(); // throws if something's wrong; confirms the client actually works
    console.log("TenantClient ready.");
    ```

    Run it the same way as before — `npx tsx quickstart.ts` — and confirm you see `TenantClient ready.` printed after your `tenantDid` line.

    <Warning>
      **This authenticates you to manage your own deployment** — a different job from agent authentication. The DID must equal the one admitted as a tenant in `idx:_tenants`: exactly the `tenantDid` you already have from Quickstart.
    </Warning>
  </Step>
</Steps>

## What's next

Continue to [Write your first TEE contract](/developers/adk/get-started/walkthrough/write-contract).

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# 1. Write your TEE contract

Clone the reference implementation now rather than typing the Rust code by hand — it's a **separate project** from the Node/TypeScript app you built in Quickstart, so put it in its own folder alongside it, not inside it:

```bash theme={null}
cd ..                                                        # out of my-t3n-app, back to a shared parent folder
git clone https://github.com/Terminal-3/z-tenant-flight.git
cd z-tenant-flight
```

Below is a walkthrough of the pieces inside that repo — change the host calls and flight-specific logic to match your needs once you understand them.

A TEE contract is a Rust crate compiled to a WASM **component**. It exports its functions through a `contracts` WIT interface and imports only the host capabilities it needs.

<Note>
  Key concepts and tips before starting:

* [Storage namespace](/t3n/how-t3n-works/z-namespace)
* [Host API](/t3n/how-t3n-works/host-api)
* [Create Tenant KV maps](/developers/adk/tips/create-kv-maps)
* [Capabilities come from your WIT imports](/developers/adk/tips/capabilities-from-wit-import)
</Note>

## Repository Structure

```
z-tenant-flight/
├── src/
│   ├── lib.rs          ← wit-bindgen entry point + Guest impl that dispatches to each fn
│   ├── search.rs       ← search-offers — Duffel search (no PII)
│   └── booking.rs      ← book-offer — Duffel booking (PII via http-with-placeholders)
├── wit/
│   ├── world.wit       ← the world your contract exports + the host interfaces it imports
│   └── deps/           ← vendored host interface packages (host-interfaces, host-tenant)
└── Cargo.toml
```

The packages under `wit/deps/` define the host ABI your contract links against — vendor the versions your target cluster provides (here, `host-interfaces-2.1.0/` and `host-tenant-1.0.0/`).

## Files

### world.wit — declare your interface + host imports

```wit theme={null}
package z:tenant-flight@0.4.0;

world tenant-flight {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http@2.1.0;                    // search (no PII)
  import host:interfaces/http-with-placeholders@2.1.0;  // booking (PII via placeholders)

  export contracts;
}

interface contracts {
  // Uniform 3-field envelope used by every node-callable contract.
  //   input        — JSON arguments for this function, as bytes
  //   user-profile — None for tenant contracts (profile is resolved host-side)
  //   context      — node-minted DynamicContext (trusted), as bytes
  record generic-input {
    input:        option<list<u8>>,
    user-profile: option<list<u8>>,
    context:      option<list<u8>>,
  }

  // One func per operation. Each takes generic-input and returns JSON bytes on
  // success, or an error string. There is no central `dispatch` function and no
  // `ContractError` enum — the function name *is* the export.
  search-offers: func(req: generic-input) -> result<list<u8>, string>;
  book-offer:    func(req: generic-input) -> result<list<u8>, string>;
}
```

[The interfaces you import here are your contract's entire capability set](/developers/adk/tips/capabilities-from-wit-import) — there is no separate manifest. The host links your contract against the matching tenant world and refuses to load it if it imports an interface that world does not provide.

### Cargo.toml — compile to a WASM component

```toml theme={null}
[package]
name = "z-tenant-flight"
version = "0.4.1"
edition = "2021"

# crate-type cdylib is what makes the wasm32-wasip2 target emit a WASM
# *component* (not a bare module). Keep "lib" too so the business logic
# stays unit-testable natively.
[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
# wit-bindgen's macro generates the bindings from wit/ at compile time.
wit-bindgen = { version = "0.49", default-features = false, features = ["macros", "realloc"] }
serde = { version = "1.0", default-features = false, features = ["derive", "alloc"] }
serde_json = { version = "1.0", default-features = false, features = ["alloc"] }

# Small, self-contained artifact — keeps registration under the size cap.
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
```

### lib.rs — generate bindings + dispatch to each function

```rust theme={null}
wit_bindgen::generate!({
    world: "tenant-flight",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod booking;
mod search;

struct Component;

// Implement the exported `contracts` interface. Each generated method unwraps
// the input bytes and hands off to the module that does the work.
#[cfg(target_arch = "wasm32")]
impl exports::z::tenant_flight::contracts::Guest for Component {
    fn search_offers(req: exports::z::tenant_flight::contracts::GenericInput) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("search-offers: missing input")?;
        search::search_offers(&input)
    }

    fn book_offer(req: exports::z::tenant_flight::contracts::GenericInput) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("book-offer: missing input")?;
        booking::book_offer(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
```

The host bindings live under `crate::host::*` and the exported interface under `crate::exports::*` — both generated by the macro from `wit/`.

### search.rs — `search_offers` (synchronous `http`, no PII)

The `http` interface is synchronous: the response is available before the call returns. Build a `Request` with a `Verb`, headers, and an optional payload.

```rust theme={null}
use crate::host::interfaces::{http as http_iface, logging};

let resp = http_iface::call(&http_iface::Request {
    method: http_iface::Verb::Post,
    url: format!("{DUFFEL_BASE}/air/offer_requests?return_offers=false"),
    headers: Some(duffel_headers(&api_key)),         // Vec<(String, String)>
    payload: Some(serde_json::to_vec(&offer_request_body).map_err(|e| e.to_string())?),
})
.map_err(|e| format!("duffel offer-request: {e}"))?;

if resp.code != 201 {
    let body = String::from_utf8_lossy(&resp.payload);
    return Err(format!("Duffel offer-request failed: HTTP {} — {body}", resp.code));
}
let _ = logging::info("offer request created");
// resp.payload holds the response bytes — parse with serde_json.
```

[Outbound HTTP is authorized by the user, not the contract](/developers/adk/tips/outbound-http-auth-by-user) — the hosts a contract may reach are resolved per-call from the calling user's grant.

### booking.rs — `book_offer` (PII via `http-with-placeholders`)

For calls that carry user PII, use `http-with-placeholders`. Put `{{profile.<field>}}` markers in the request body; the host resolves them from the calling user's profile at dispatch time, so plaintext PII never enters WASM memory.

```rust theme={null}
use crate::host::interfaces::http_with_placeholders as hwp;
use serde_json::json;

let order_body = json!({
    "data": {
        "type": "instant",
        "selected_offers": [req.offer_id],
        "passengers": [{
            "id": req.passenger_id,                              // opaque Duffel id — not PII
            // Resolved host-side from the user's profile (PII never enters WASM):
            "given_name":  "{{profile.first_name}}",
            "family_name": "{{profile.last_name}}",
            "born_on":     "{{profile.date_of_birth}}",
            "email":       "{{profile.verified_contacts.email.value}}",
        }],
        "payments": [{ "type": "balance", "amount": req.total_amount, "currency": req.total_currency }]
    }
});

let resp = hwp::call(&hwp::Request {
    method: hwp::Verb::Post,
    url: format!("{DUFFEL_BASE}/air/orders"),
    headers: Some(duffel_headers(&api_key)),
    payload: Some(serde_json::to_vec(&order_body).map_err(|e| e.to_string())?),
})
.map_err(|e| format!("duffel create-order: {}", format_http_error(e)))?;
```

`hwp::call` returns a typed `HttpError` so failures never leak resolved PII — match on it for clear messages:

```rust theme={null}
fn format_http_error(e: hwp::HttpError) -> String {
    match e {
        hwp::HttpError::EgressDenied(host)        => format!("egress denied for host {host}"),
        hwp::HttpError::PlaceholderDenied(marker) => format!("placeholder not permitted: {marker}"),
        hwp::HttpError::PlaceholderUnknown(field) => format!("user profile missing field: {field}"),
        hwp::HttpError::PlaceholderNoUserContext  => "no user context bound for placeholder resolution".to_string(),
        hwp::HttpError::UpstreamError(reason)     => format!("upstream: {reason}"),
    }
}
```

See [Placeholders in outbound calls](/developers/adk/tips/placeholders-outbound-calls).

### Reading secrets from the `secrets` KV map

The API key is read from the tenant's `secrets` KV map at runtime. [The key is seeded by the tenant SDK](/developers/adk/tips/seed-api-key) before the contract runs — there is no `set-credentials` host function. `kv-store` calls take the **full** `z:<tid>:<map>` name; build it from `tenant-context` at runtime (the host enforces the prefix):

```rust theme={null}
use crate::host::{interfaces::kv_store, tenant::tenant_context};

fn get_api_key() -> Result<String, String> {
    // tenant_did() returns raw bytes (list<u8>) — hex-encode them to build the
    // z:<tid>: map path (this matches the map the tenant SDK created for you).
    let tid = tenant_context::tenant_did();
    let map_name = format!("z:{}:secrets", hex::encode(&tid));
    let bytes = kv_store::get(&map_name, b"duffel_api_key")
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or("duffel_api_key not found in z:<tid>:secrets — populate it via the tenant SDK before use")?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
```

## Key Design Rules

* Export functions on the `contracts` interface. Each takes `generic-input` and returns `result<list<u8>, string>` — JSON bytes on success, an error string on failure. There is **no** `dispatch` function and **no** `ContractError` enum.
* `kv-store` calls take the **full** `z:<tid>:<map>` name. Build it at runtime by hex-encoding `tenant_context::tenant_did()`, which returns raw bytes: `format!("z:{}:secrets", hex::encode(&tid))`. The host enforces the prefix. The map must exist (created and populated by the tenant SDK) before the contract reads or writes it.
* Import only the host interfaces you use — they are your contract's entire capability set. The host refuses to load a contract that imports an interface its tenant world does not provide.
* `http::call` is synchronous; you get the response back before the function returns. Its egress is authorized per-call by the calling user's grant.
* For calls carrying user PII, use `http-with-placeholders`: put `{{profile.<field>}}` markers in the request and the host resolves them inside the enclave, so plaintext PII never enters your contract.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# 2. Build your TEE contract

This step turns the Rust contract from [Step 1](/developers/adk/get-started/walkthrough/write-contract) into a WASM component. Run these commands below from the contract repository root, where `Cargo.toml` and `wit/world.wit` live.

<Note>
  You do not need `cargo-component`. With `crate-type = ["cdylib", "lib"]` in `Cargo.toml`, the `wasm32-wasip2` target emits a WASM component that T3N can inspect and register.
</Note>

## Build the release artifact

Install the WASI Preview 2 target once per machine, then build the release artifact:

```bash theme={null}
rustup target add wasm32-wasip2
cargo build --target wasm32-wasip2 --release
```

Cargo writes the component to `target/wasm32-wasip2/release/`. If your package name contains hyphens, Cargo converts them to underscores in the file name. The `z-tenant-flight` package therefore builds to:

```bash theme={null}
target/wasm32-wasip2/release/z_tenant_flight.wasm
```

Confirm the file exists before moving on:

```bash theme={null}
ls -lh target/wasm32-wasip2/release/*.wasm
```

The `.wasm` file is the artifact you pass to `tenant.contracts.register` in [Step 3](/developers/adk/get-started/walkthrough/register-contract).

## Verify the component interface

Use `wasm-tools` to print the component's WIT interface:

```bash theme={null}
wasm-tools component wit target/wasm32-wasip2/release/z_tenant_flight.wasm
```

The output should include the host interfaces you imported in `wit/world.wit`, such as `host:interfaces/kv-store`, and your exported interface:

```wit theme={null}
export contracts;
```

If `wasm-tools` is not installed yet:

```bash theme={null}
cargo install wasm-tools
```

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# 3. Register your TEE contract

Registration uploads the WASM component you built in [Step 2](/developers/adk/get-started/walkthrough/build-contract) and gives it a tenant-local name. After this step, T3N knows about your contract and gives you a numeric `contract_id` that you use when creating map ACLs.

This code goes back in `quickstart.ts` — the Node/TypeScript project from Quickstart — not in the `z-tenant-flight` Rust repo. Append it to the bottom, after the `TenantClient` code from [Set Up Dev Env](/developers/adk/get-started/prerequisites/set-up-dev-env).

Before you run this code, make sure you have:

* An authenticated `TenantClient` named `tenant`. If you have not created one yet, complete [Quickstart](/developers/adk/get-started/quickstart) and [Set Up Dev Env](/developers/adk/get-started/prerequisites/set-up-dev-env) first.
* A compiled WASM file at `target/wasm32-wasip2/release/z_tenant_flight.wasm`, **inside the separate `z-tenant-flight` folder you cloned** in [Write your TEE contract](/developers/adk/get-started/walkthrough/write-contract) — not inside your Node project.
* Your `tenantDid`, for example `did:t3n:abcdef0123456789abcdef0123456789abcdef01`.

## Choose a contract tail

The `tail` is the local name of your contract inside your tenant namespace. Pass only the part after `z:<tid>:`. For example, the tail `travel-contracts` becomes:

```text theme={null}
z:<tid>:travel-contracts
```

Do not include `z:<tid>:` in the `tail`; the SDK and host derive that from the authenticated tenant.

A tail may contain letters, digits, `_`, `-`, and `.` — but **not** `/`. The SDK rejects slashes (`tail must match /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,127}$/`).

Pick a stable tail for each contract you plan to maintain. When you register a new build at the same tail, increase the `version` value; changing the tail creates a separate contract entry.

<Note>
  Keep tails short and simple (a few words, hyphen-separated) rather than long or descriptive. The full canonical name (`z:<tid>:<tail>`) gets reused downstream in places like delegation grants, and a handful of teams have hit unexpectedly-strict length limits further down the pipeline when using long tails. The 128-character limit above is enforced at registration; treat it as a ceiling, not a target.
</Note>

## Register the WASM

```typescript theme={null}
import { readFile } from "fs/promises";

// Path to the .wasm file INSIDE your cloned z-tenant-flight folder, relative
// to quickstart.ts. Adjust this if you cloned it somewhere else.
const WASM_PATH = "../z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm";
const CONTRACT_TAIL = "travel-contracts";
const CONTRACT_VERSION = "0.1.0";

const wasmBytes = await readFile(WASM_PATH);

const result = await tenant.contracts.register({
  tail: CONTRACT_TAIL,
  version: CONTRACT_VERSION,
  wasm: wasmBytes,
});

// This numeric ID is required in the next setup step when you create map ACLs.
const contractId = result.contract_id;
const tenantId = tenantDid.slice("did:t3n:".length);
const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;

console.log(`registered ${scriptName} as contract id ${contractId}`);
```

`WASM_PATH` above assumes you cloned `z-tenant-flight` as a sibling folder next to your Node project (i.e. `../z-tenant-flight/...` from `quickstart.ts`) — if you put it somewhere else, update the path accordingly.

<Note>
  Registration does not run your code, create maps, seed secrets, or grant outbound HTTP access. It only stores the component and records the versioned contract entry for your tenant.
</Note>

## What T3N stores

The register payload is just `{ tail, version, wasm }`; there is no manifest.

Host-side, T3N:

1. Stores the WASM blob in content-addressed storage.
2. Allocates a numeric `ContractId`.
3. Records the contract under your tenant registry.

Your contract's capabilities come from the host interfaces it imports in `world.wit`, not from this registration request. See [Capabilities come from your WIT imports](/developers/adk/tips/capabilities-from-wit-import).

Outbound hosts are also not declared here. They come from the calling user's authorization grant at invoke time. See [Outbound HTTP is authorized by the user, not the contract](/developers/adk/tips/outbound-http-auth-by-user).

<Warning>
  **Re-registering a tail allocates a new `contract_id`.** Unpinned calls resolve to the *latest* registered version (that's what `getContractVersion()` returns); if you need a specific version, pass it explicitly to `contracts.execute()` and it will be honored. The real gotcha is the id: there is currently no API to fetch a tail's current `contract_id` after re-registering, so if you created map ACLs scoped to the old `contract_id`, a re-registration can leave them pointing at a stale id. Keep a record of each `contract_id` your tenant registers so you can re-grant map access if needed.
</Warning>

## First-run troubleshooting

| Error or symptom                                                                                                                | What it usually means                                                                                                                                                                        | What to do                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENOENT: no such file or directory`                                                                                             | The WASM path is wrong, or the contract was not built yet — a common cause is `WASM_PATH` pointing into your Node project instead of across to the separate `z-tenant-flight` folder.        | Re-run Step 2 and confirm the path with `ls -lh <path-to-z-tenant-flight>/target/wasm32-wasip2/release/*.wasm`, then check `WASM_PATH` is relative to where `quickstart.ts` actually runs from. |
| `tenant not found`                                                                                                              | The session DID does not match an admitted tenant — you constructed or derived `tenantDid` instead of reading it from the session.                                                           | Read `tenantDid` from `did.value` after authenticating (see [Quickstart](/developers/adk/get-started/quickstart)), then rebuild `TenantClient` with it. Confirm with `tenant.tenant.me()`.      |
| `version <x> is not higher than current version <y>`                                                                            | You already registered this tail with the same or a higher version.                                                                                                                          | Bump `CONTRACT_VERSION`, for example from `0.1.0` to `0.1.1`.                                                                                                                                   |
| The contract registers, but later cannot read `secrets`                                                                         | The map does not exist yet, or its ACL does not include this `contractId`.                                                                                                                   | Use the returned `contractId` when creating the `secrets` map ACLs.                                                                                                                             |
| A previously-working pinned-version call starts failing or behaving unexpectedly                                                | An explicit pinned version is honored by `contracts.execute()`, so a pinned call failing usually means that version was never successfully registered/executable — not that it was shadowed. | Verify the pinned version is actually registered and executable; for the default (unpinned) path, `getContractVersion()` returns the latest registered version.                                 |
| A long contract tail is rejected further downstream (e.g. when building a delegation grant), even though registration succeeded | Some downstream operations enforce a shorter length limit on the full canonical name than registration does.                                                                                 | Prefer a short tail from the start — see the note above.                                                                                                                                        |

The contract is now registered. It still cannot complete the full end-to-end flow until the [maps](/developers/adk/tips/create-kv-maps) and [secrets](/developers/adk/tips/seed-api-key) it reads at runtime exist.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# 4. Invoke your TEE contract

Agents call your contract via the same `execute` transport as any other T3N contract. The only difference is the `contract_id` starts with `z:<tid>:`.

<Note> **Agents authenticate as themselves, not as tenants.** Like every T3N session, an agent reads its own DID back from the authenticated session — there's nothing tenant-specific to set.</Note>

## 1. Set up the agent's identity

An agent is a separate authenticated session with its own key — it is not the tenant and not the user. Build it the same way you built `t3n` in [Quickstart](/developers/adk/get-started/quickstart), but with its own credential:

```typescript theme={null}
import {
  T3nClient,
  loadWasmComponent,
  createEthAuthInput,
  eth_get_address,
  metamask_sign,
  getContractVersion,
  getNodeUrl,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

const agentKey = process.env.AGENT_KEY!; // a separate credential — never reuse your tenant's T3N_API_KEY
const agentAddress = eth_get_address(agentKey);

const agentClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,   // node URL resolved from setEnvironment() — see set-up-dev-env
  handlers: {
    EthSign: metamask_sign(agentAddress, undefined, agentKey),
  },
});

await agentClient.handshake();
const agentAuth = await agentClient.authenticate(createEthAuthInput(agentAddress));
const agentDid = agentAuth.value; // reused below when the user authorizes this agent

const TENANT_SCRIPT = `z:${tenantDid.slice("did:t3n:".length)}:travel-contracts`;
const scriptVersion = await getContractVersion(getNodeUrl(), TENANT_SCRIPT);
```

<Note>
  **Where `AGENT_KEY` comes from.** An agent's key is not derived from your tenant key —
  get it the same way you got your own, from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens).
  It needs its **own** test credits too: an agent DID's balance is separate from its
  tenant's and starts at zero, so a key generated any other way (or your tenant's key,
  reused) will fail metered calls with `InsufficientCreditError`. See
  [Register a Public Agent](/developers/agents/register-agent) for the full flow.
</Note>

## 2. Authorize the contract's egress (as the user)

Before any function that makes an outbound HTTP call can run, the **user (data owner)** must authorize it. A tenant contract's allowed hosts are resolved per-call from the user's authorization grant — not from the contract.

In this walkthrough you're standing in for the user yourself, so build a third session — `userClient` — with its own credential, exactly like `t3n` and `agentClient` above:

```typescript theme={null}
const userKey = process.env.USER_KEY!; // stands in for the real data owner's own key
const userAddress = eth_get_address(userKey);

const userClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: {
    EthSign: metamask_sign(userAddress, undefined, userKey),
  },
});

await userClient.handshake();
await userClient.authenticate(createEthAuthInput(userAddress));
```

Now the user signs an `agent-auth-update` scoping the agent to your contract, its functions, and the hosts it may reach:

```typescript theme={null}
// Signed by the USER (data owner), not the agent.
const userContractVersion = await getContractVersion(getNodeUrl(), "tee:user/contracts");
await userClient.execute({
  contract_id: "tee:user/contracts",
  contract_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: agentDid,                               // from step 1
      scripts: [{
        scriptName: TENANT_SCRIPT,                      // z:<tid>:travel-contracts, from step 1
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],
        allowedHosts: ["api.duffel.com"],               // hosts the contract may dial
      }],
    }],
  },
});
```

For a **direct (self) call** — where the user invokes the contract themselves rather than through a separate agent — set `agentDid` to the user's own DID (a self-grant) instead of building a separate `agentClient`. Without a matching grant the contract still runs, but any outbound call is denied with `host/http.egress_denied`. See [Outbound HTTP is authorized by the user, not the contract](/developers/adk/tips/outbound-http-auth-by-user).

## 3. Invoke your contract (as the agent)

With the grant in place, the agent can call the contract's functions:

```typescript theme={null}
// 1. Search for offers (no PII)
const search = await agentClient.executeAndDecode({
  contract_id: TENANT_SCRIPT,
  contract_version: scriptVersion,
  function_name: "search-offers",
  input: { origin: "LHR", destination: "JFK", departure_date: "2026-07-15", cabin_class: "economy", adult_count: 1 },
});
const offer = search.offers[0];

// 2. Book the chosen offer. No PII in the input — name, DOB and email are
//    resolved host-side from the user's profile via http-with-placeholders,
//    and only when the user's grant authorizes this agent (see the grant above).
const booking = await agentClient.executeAndDecode({
  contract_id: TENANT_SCRIPT,
  contract_version: scriptVersion,
  function_name: "book-offer",
  input: {
    offer_id:       offer.id,
    passenger_id:   offer.passenger_ids[0],  // opaque Duffel id from search — not PII
    total_amount:   offer.total_amount,
    total_currency: offer.total_currency,
  },
});
// booking.pnr → the flight booking reference. The passenger's name never left the enclave.
```

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# 5. Test your TEE contract

**Unit tests (Rust):**

Test the business-logic guards on the native target with `cargo test`. Each
function takes the raw input bytes and returns `Result<Vec<u8>, String>`, so you
call it directly and assert on the error string — there is no `ContractError`
enum or test harness to set up. Functions that call the host (`http`, `kv-store`)
only run on `wasm32`; natively they return an error, so unit tests focus on input
parsing and validation.

```rust theme={null}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn book_offer_rejects_inline_pii() {
        // book-offer deserialises into a struct with only opaque ids + amount,
        // so a payload that tries to smuggle passenger PII fails at parse time.
        let input = serde_json::to_vec(&serde_json::json!({
            "offer_id": "off_1",
            "passengers": [{ "given_name": "Jane" }],   // not a valid field
            "total_amount": "199.00", "total_currency": "GBP",
        }))
        .unwrap();
        let err = book_offer(&input).unwrap_err();
        assert!(err.contains("bad input"));
    }

    #[test]
    fn book_offer_rejects_non_json() {
        assert!(book_offer(b"not json").unwrap_err().contains("bad input"));
    }
}
```

**Test checklist:**

* Happy path: `search-offers` → `book-offer` returns `{ id, pnr, status }`.
* Input hygiene: `book-offer` accepts only `offer_id`, `passenger_id`, `total_amount`, `total_currency` — any payload carrying passenger PII is rejected.
* PII never in output: `passport`, `date_of_birth`, and name fields do not appear in any return value or log line.
* The `{{profile.*}}` markers stay literal in the contract — resolution happens host-side, so they never appear resolved in WASM memory.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Agent Auth

> How an AI agent authenticates to T3N, and how it gets permission to act on a contract.

This page covers two separate things that are easy to conflate: an agent **authenticating** to T3N (proving who it is), and an agent being **authorized** to call a specific contract function (proving it's allowed to).

<Info>
  This is about **agents** acting through your contract. If you're looking for how *you*, the tenant developer, authenticate to manage your own deployment, see [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) instead — that's a different session.

  This page assumes the agent **already has a DID**. Creating that identity in the first place — minting the agent and publishing its agent card — is [Agent Onboarding](/developers/agents/register-agent), which happens before anything on this page.

  That identity also needs its **own** test credits before any metered call on this page will work — an agent DID's balance is separate from its tenant's and starts at zero. Get it a key from the same [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) you used for your own; it comes with credits attached.
</Info>

## 1. An agent authenticates like any other T3N session

An agent has its own identity — its own key pair and its own DID — separate from the tenant that owns the contract it's calling. It authenticates the same way any T3N client does: handshake, then authenticate, then read its own DID back from the session. There's nothing tenant-specific to configure here.

```typescript theme={null}
import {
  T3nClient,
  loadWasmComponent,
  createEthAuthInput,
  eth_get_address,
  metamask_sign,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

const agentKey = process.env.AGENT_KEY!; // a separate key for the agent — never reuse your tenant's T3N_API_KEY
const agentAddress = eth_get_address(agentKey);

const agentClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: {
    EthSign: metamask_sign(agentAddress, undefined, agentKey),
  },
});

await agentClient.handshake();
const agentDid = await agentClient.authenticate(createEthAuthInput(agentAddress));
```

<Warning>
  Never hard-code or derive an agent's DID any more than you would a tenant's — always read it back from the authenticated session, exactly as `agentDid` is read above. And generate `AGENT_KEY` as its own separate credential (the same way you'd generate any Ethereum-style keypair) — don't reuse your tenant's `T3N_API_KEY` for an agent.
</Warning>

## 2. Being authenticated is not being authorized

Authenticating proves the agent's identity. It does **not** grant it permission to call anything. Before an agent can invoke a contract function — especially one that makes an outbound HTTP call — the **user who owns the data** (the "data owner," not the agent, and not you as the tenant developer) has to explicitly grant that agent access:

```typescript theme={null}
// Signed by the user (data owner), not the agent.
await userClient.execute({
  contract_id: "tee:user/contracts",
  contract_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: agentDid,                 // the agent being authorized
      scripts: [{
        scriptName: TENANT_SCRIPT,        // z:<tid>:your-contract-tail
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],   // exactly which functions
        allowedHosts: ["api.duffel.com"], // exactly which external hosts
      }],
    }],
  },
});
```

`userClient` here is the data owner's own authenticated session — built the same way as `t3n`/`agentClient` above, just with the user's own key. See [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract) for the full construction and where `TENANT_SCRIPT`/`scriptVersion` come from.

A grant is scoped three ways at once: which contract, which functions on it, and which external hosts it may reach. An agent with no matching grant can still call the contract — the call just fails at the point it tries to reach the network, with `host/http.egress_denied`.

<Accordion title="Under the Hood: why is it structured this way?">
  Splitting authentication from authorization means a compromised or misbehaving agent key doesn't automatically mean compromised data access — the blast radius of a leaked agent key is exactly whatever scripts, functions, and hosts a user has explicitly granted it, nothing more. It also means a user can revoke an agent's access without the agent's key changing at all — they just stop re-issuing the grant.
</Accordion>

## Direct (self) calls work the same way

If a user is invoking their own contract directly rather than through a separate agent, the same grant mechanism applies — they just grant to their own DID (a self-grant) instead of an agent's.

## Full working example

See [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract) for this in context, including the search/book contract call itself. For why the outbound call fails without a grant even when the contract code is correct, see [Outbound HTTP calls are authorized by the user, not the contract](/developers/adk/tips/outbound-http-auth-by-user).

<Note>
  Some SDK type definitions reference a broader delegation-credential API (functions for building and signing standalone delegation credentials, separate from the `agent-auth-update` grant shown above). That surface isn't confirmed or documented yet — if you find it in the SDK's TypeScript types and need it, ask in the [developer Telegram](https://t.me/terminal3developer) rather than guessing at the signatures, and we'll get this page updated once it's verified.
</Note>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Register a Public Agent

> Give your agent a T3N identity and publish its agent card — from installing the SDK to verifying the registration.

This guide takes an AI agent from nothing to a publicly resolvable identity on T3N: a `did:t3n` DID plus an agent card that **T3N hosts and serves** for other agents and services to discover — no external storage required. Every step uses the `t3n` CLI that ships with the [`@terminal3/t3n-sdk`](https://www.npmjs.com/package/@terminal3/t3n-sdk) package — no code required.

<Note>
  **Onboarding, not permissions.** This page gives an agent an *identity* and a *card*. It does not grant the agent access to anything — no user data, no contract functions. That's a separate step the data owner performs afterwards: see [Agent Auth](/developers/adk/overview/agent-auth-adk).

  **Two onboarding paths.** This is the one where an agent **registers itself** — public and discoverable. If instead an **organization** provisions and owns the agent (with a card kept **private by default**), see [Register an Organization-owned Agent](/developers/agents/provision-org-agent).
</Note>

The flow is:

1. Download the SDK
2. Get the agent's key
3. Get the agent's DID
4. Scaffold the agent card
5. Host the agent card on T3N
6. Verify the registration

<Info>
  All commands that talk to the network accept `--env testnet|production` (or the `T3N_ENV` environment variable). Use `--env testnet` while you're building — the examples below do.
</Info>

<Steps>
  <Step title="Download the SDK">
    The CLI is part of the TypeScript SDK. You can run it with zero install, or install it globally:

    ```bash theme={null}
    # zero-install — always runs the latest published version
    npx @terminal3/t3n-sdk --help

    # or install globally (Node.js >= 18)
    pnpm add -g @terminal3/t3n-sdk
    t3n --help
    ```

    The rest of this guide uses the global `t3n` form; substitute `npx @terminal3/t3n-sdk` if you skipped the install.
  </Step>

  <Step title="Get the agent's key">
    The agent's identity key is a standard Ethereum-style **secp256k1 private key** (32 bytes, `0x`-prefixed hex). Registration is a write operation that consumes credits, and an agent's credit balance is separate from its tenant's — so get this key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens), the same self-serve page you used to claim your own key: it issues a fresh key together with metered test credits every time, so you can revisit it once per agent, not just once for yourself. A key generated any other way (there is no `t3n keygen` command, but any tool that generates an Ethereum keypair produces a technically-usable one) starts with **zero** credits and can't pay for this step.

    Put the key in your shell's environment; every signing command reads it from there (or from `--api-key`):

    ```bash theme={null}
    export T3N_API_KEY="0x<the agent's private key>"
    ```

    <Warning>
      The key never leaves your machine — the CLI uses it locally to sign a login challenge. Treat it like any private key: keep it out of source control, and give each agent its **own** key. Never reuse your tenant developer key for an agent (see [Agent Auth](/developers/adk/overview/agent-auth-adk)).
    </Warning>
  </Step>

  <Step title="Get the agent's DID">
    A T3N DID has the form `did:t3n:<40 hex characters>`. The network binds it to your key the first time you authenticate — so you don't compute it yourself, you read it back:

    ```bash theme={null}
    t3n whoami --env testnet
    # did:t3n:1a2b3c...

    export AGENT_DID=$(t3n whoami --env testnet)
    ```

    <Warning>
      **Always read the DID back from `t3n whoami` (or `--json` for `{"did": "..."}`).** Never hard-code a DID or try to derive it from the key locally — the canonical value is the one the network returns for your authenticated session.
    </Warning>
  </Step>

  <Step title="Scaffold the agent card">
    The agent card is a JSON document, following the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) registration format, that describes your agent and lists its service endpoints — including its [A2A](https://a2a-protocol.org/) agent card. Scaffold one with:

    ```bash theme={null}
    t3n agent create-card --did "$AGENT_DID"
    ```

    Run interactively, it walks you through name, description, image, and which services to include (A2A / MCP / DID). In scripts or CI it falls back to flags: `--out <file>` (default `agent-card.json`), `--name`, `--description`, `--image`, `--did`, `--x402`, and `--force` to overwrite an existing file.

    The generated `agent-card.json` looks like this:

    ```json theme={null}
    {
      "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      "name": "My T3N Agent",
      "description": "REPLACE: what your agent does",
      "services": [
        {
          "name": "A2A",
          "endpoint": "https://agent.example/.well-known/agent-card.json",
          "version": "0.3.0"
        },
        {
          "name": "MCP",
          "endpoint": "https://mcp.agent.example/",
          "version": "2025-06-18"
        },
        {
          "name": "DID",
          "endpoint": "did:t3n:REPLACE_WITH_YOUR_DID",
          "version": "v1"
        }
      ],
      "x402Support": false,
      "active": true,
      "registrations": [],
      "supportedTrust": ["tee-attestation"]
    }
    ```

    Before moving on, replace the placeholders: point the `A2A` service endpoint at your agent's real `.well-known/agent-card.json` URL, the `MCP` endpoint at your MCP server (or remove services you don't offer), and make sure the `DID` service endpoint is your `$AGENT_DID` (the `--did` flag fills this in for you). Keep the whole card under **16 KiB** — that's the limit T3N accepts when it hosts the body in the next step.
  </Step>

  <Step title="Host the agent card on T3N">
    T3N hosts the card for you — no external bucket, pinning service, or web server required. One command stores your `agent-card.json` and publishes it to a world-readable endpoint keyed by your DID:

    ```bash theme={null}
    t3n agent host-card --file agent-card.json --env testnet
    # card published: https://<node>/api/agent-card/did:t3n:1a2b3c...
    ```

    That's it — your card is now served, verbatim, at `GET /api/agent-card/<did>`. `host-card` does two things in one transaction: it stores the card **privately** under your DID, then publishes a public copy. Update it any time by editing the JSON and re-running `host-card`; take it down with `t3n agent card-unpublish`.

    <Note>
      T3N validates and serves the card **body** itself: it must be a single JSON object of at most **16 KiB**, and it is served byte-for-byte at `GET /api/agent-card/<did>`. This is the T3N-hosted path — you no longer need to host the JSON anywhere else.
    </Note>

    <Tip>
      **Registering just a URI instead.** If you'd rather keep the card on your own domain (per the ERC-8004 model), `t3n agent set-card --uri "<https url>"` records that URL in your DID document's `AgentService` endpoint. As a convenience it also publishes a minimal **default** T3N card for your DID so you're immediately discoverable — pass `--no-card` to skip that, or run `host-card` afterwards to replace the default with your full card. Existing cards are never overwritten.
    </Tip>

    <Accordion title="Under the Hood: what does host-card actually do?">
      `host-card` opens an authenticated session with your agent key and runs two writes on the built-in `tee:org-data/contracts` TEE contract: it stores the card as ordinary org-data in your **self-owned** `agent-cards` scope (private, keyed by a deterministic entry id for your DID), then `agent-card-publish` copies that body into the world-readable `public:agent_cards` map the endpoint reads. You can only host or publish a card for your **own** DID; an organisation hosting on behalf of its agents uses `--owner`/`--agent` and a consent link (see [Agent Auth](/developers/adk/overview/agent-auth-adk)).
    </Accordion>
  </Step>

  <Step title="Verify the registration">
    Resolution is public — anyone can fetch your card without a key. Hit the endpoint directly:

    ```bash theme={null}
    curl https://<node>/api/agent-card/"$AGENT_DID"
    # → your agent-card.json, served verbatim
    ```

    If you also registered a URI with `set-card`, it appears in your DID document's `AgentService` endpoint, resolvable through the public DID resolver (`GET /api/did/<did>`):

    ```bash theme={null}
    t3n agent registry "$AGENT_DID" --env testnet
    # id:    did:t3n:1a2b3c...
    # agent: https://<node>/api/agent-card/did:t3n:1a2b3c...
    ```

    ```json theme={null}
    {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/secp256k1recovery-2020/v2"
      ],
      "id": "did:t3n:1a2b3c...",
      "verificationMethod": [
        {
          "id": "did:t3n:1a2b3c...#eth-owner",
          "type": "EcdsaSecp256k1RecoveryMethod2020",
          "controller": "did:t3n:1a2b3c...",
          "blockchainAccountId": "eip155:1:0x<owner address>"
        }
      ],
      "authentication": ["did:t3n:1a2b3c...#eth-owner"],
      "service": [
        {
          "id": "did:t3n:1a2b3c...#agent",
          "type": "AgentService",
          "serviceEndpoint": "https://<node>/api/agent-card/did:t3n:1a2b3c..."
        }
      ]
    }
    ```

    Consumers verify ownership through the DID document itself: the `verificationMethod` binds the DID to the owner's key, and the card body is served at the T3N endpoint above. `t3n did get <did>` prints the same view, and `t3n agent registry <did> --full` (authenticated) reads the full registry record directly from the contract.

    If the endpoint returns your card, you're done — your agent is registered and discoverable on T3N.
  </Step>
</Steps>

## What's next

* The agent now has an identity and is discoverable. Next, let it actually *do* something — granting permission to act on users' data and contracts → [Agent Auth](/developers/adk/overview/agent-auth-adk) and [Delegate Access](/t3n/data-owner-guide/delegate-access)
* How DIDs work on T3N → [Decentralized Identifiers](/t3n/how-t3n-works/did)
* Registration writes consume credits → [Tokens](/t3n/how-t3n-works/tokens)

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Register an Organization-owned Agent

> Mint an agent your organization owns and controls, with a private agent card the org manages — from installing the SDK to reading the card back.

This guide takes an organization from nothing to owning an agent on T3N: a `did:t3n` DID the organization controls, with an agent card that **T3N hosts privately** for the organization to manage — never public unless the organization chooses. Every step uses the `t3n` CLI that ships with the [`@terminal3/t3n-sdk`](https://www.npmjs.com/package/@terminal3/t3n-sdk) package — no code required, for the whole lifecycle: create, read, and update (updating needs CLI 4.25.0 or newer; older installs have an SDK fallback).

<Note>
  **Onboarding, not permissions.** This page gives an agent an *identity* and a *card*. It does not grant the agent access to anything — no user data, no contract functions. That's a separate step the data owner performs afterwards: see [Agent Auth](/developers/adk/overview/agent-auth-adk).

  **Two onboarding paths.** This is the one where an **organization owns** the agent, with a card kept **private by default**. If instead an agent **registers itself** — public and discoverable — see [Register a Public Agent](/developers/agents/register-agent).
</Note>

The flow is:

1. Download the SDK
2. Get an org admin's key
3. Create your organization
4. Scaffold the agent card
5. Provision the agent
6. Read the card back

<Info>
  All commands that talk to the network accept `--env sandbox|testnet|production` (or the `T3N_ENV` environment variable); `sandbox` and `testnet` are the same test network. `testnet` is the default — the examples below pass it explicitly anyway, so a copied command never depends on your shell.
</Info>

<Steps>
  <Step title="Download the SDK">
    The CLI is part of the TypeScript SDK. You can run it with zero install, or install it globally:

    ```bash theme={null}
    # zero-install — always runs the latest published version
    npx @terminal3/t3n-sdk --help

    # or install globally (Node.js >= 18)
    pnpm add -g @terminal3/t3n-sdk
    t3n --help
    ```

    The rest of this guide uses the global `t3n` form; substitute `npx @terminal3/t3n-sdk` if you skipped the install.
  </Step>

  <Step title="Get an org admin's key">
    The organization admin's key is a standard Ethereum-style **secp256k1 private key** (32 bytes, `0x`-prefixed hex). Provisioning is a write operation that consumes credits, so get this key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) — it's self-serve, issues a fresh key together with metered test credits every time you visit, and a key generated any other way starts with zero credits and can't pay for this step.

    Put the key in your shell's environment; every signing command reads it from there (or from `--api-key`):

    ```bash theme={null}
    export T3N_API_KEY="0x<the org admin's private key>"
    ```

    <Warning>
      Give the admin its **own** key and keep it out of source control. Every command below is signed by this key, so whoever holds it controls the organization and the agents it owns.
    </Warning>
  </Step>

  <Step title="Create your organization">
    Skip this if your organization already exists — just use its DID. Otherwise create one; the authenticated caller becomes its initial admin:

    ```bash theme={null}
    export ORG_DID=$(t3n org create --name "Acme Robotics" --env testnet --json | jq -r .organisationDid)
    echo "$ORG_DID"
    # did:t3n:0a1b2c...
    ```

    Drop `--json` for human-readable output (`organisation created: did:t3n:0a1b2c...`) if you'd rather copy the DID by hand.

    <Warning>
      `org create` is **not** idempotent — every call mints a *new* organization. Run it once and keep the DID; re-running it because you lost the DID leaves an orphan org behind.
    </Warning>
  </Step>

  <Step title="Scaffold the agent card">
    The agent card is a JSON document, following the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) registration format, that describes the agent and lists its service endpoints — including its [A2A](https://a2a-protocol.org/) agent card. Scaffold one with:

    ```bash theme={null}
    t3n agent create-card --out agent-card.json
    ```

    Run interactively, it walks you through name, description, image, and which services to include (A2A / MCP / DID). In scripts it falls back to flags: `--name`, `--description`, `--image`, `--did`, `--x402`, and `--force`. Replace the placeholders with your agent's real endpoints and keep the whole card under **16 KiB**.

    <Note>
      This step is **optional** — skip it to let T3N host a minimal default card for the agent instead (shown in the next step).
    </Note>
  </Step>

  <Step title="Provision the agent">
    Mint the agent and host its card, all in one transaction. You don't need a URL for the card — T3N serves it at `/api/agent-card/<did>`:

    ```bash theme={null}
    t3n agent create \
      --org "$ORG_DID" \
      --name "Booking Bot" \
      --card agent-card.json \
      --env testnet
    # agent created: did:t3n:1a2b3c...
    # ⚠ API key (shown ONCE — store it now, it is the agent's credential):
    #   t3n_key_43c008200b3a6c2c.6aab9ce6be8f33ba...
    #   key id: 43c008200b3a6c2c
    # private card hosted from agent-card.json (publish with: t3n agent card-publish ...)
    ```

    One transaction mints the agent's DID and its wallet, and hosts the card **privately** under the organization. Nothing is published — the agent is not publicly discoverable, by design.

    <Warning>
      **The API key is printed exactly once and cannot be recovered.** Store it now — it is the agent's *own* credential, what the agent uses to authenticate as itself.

      The agent's secp256k1 key is minted **inside the TEE and never leaves it**; you never see a private key. What you get instead is an opaque bearer token, `t3n_key_<key-id>.<secret>`, of which only a hash is stored on-ledger — which is why it is unrecoverable rather than merely inconvenient to look up. The agent presents it verbatim in the `X-T3N-Api-Key` header of a stateless `POST /api/invoke`.

      Scripting? Use `--json` and capture `.apiKey`, plus `.keyId` (the 16-hex lookup id, safe to log and to store alongside your records — the secret half is not).
    </Warning>

    <Note>
      **Drop `--card` to host a default card.** `t3n agent create --org "$ORG_DID" --name "Booking Bot"` (nothing else) hosts a minimal default card, named after the agent, with its DID as the service entry:

      ```json theme={null}
      {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": "Booking Bot",
        "description": "T3N-registered agent (default card)",
        "services": [
          { "name": "DID", "endpoint": "did:t3n:1a2b3c...", "version": "v1" }
        ],
        "x402Support": false,
        "active": true,
        "registrations": [],
        "supportedTrust": ["tee-attestation"]
      }
      ```

      Pass `--no-card` to mint the agent with **no** card at all — add one later with `card-set`, which needs the writer grant covered in the last step. And pass `--uri <url>` only if the agent also has its **own** external endpoint you want recorded in its DID document (an `agent-uri` service entry is added for it).
    </Note>
  </Step>

  <Step title="Read the card back">
    The card lives in your organization's private scope. Read it back as an org admin — **no publishing required**:

    ```bash theme={null}
    export AGENT_DID="did:t3n:1a2b3c..."

    t3n agent card-get --owner "$ORG_DID" --agent "$AGENT_DID" --env testnet
    # → the card JSON, returned to authorized readers only
    ```

    Only the organization's admins — or a principal you grant a delegation credential to — can read it. It is **not** exposed at the public `/api/agent-card/<did>` endpoint.

    That's the whole lifecycle for a private org agent — create, read, update — all authenticated, none of it public. If `card-get` returns your card, you're done; updating it takes the one extra grant below.

    <Warning>
      **Updating the card needs one more grant.** `t3n agent card-set --owner "$ORG_DID" --agent "$AGENT_DID" --file agent-card.json` fails for a freshly created org with:

      ```
      error: RPC Error: NotScopeWriter: signing user is not a writer for this scope
      ```

      This is by design, not a bug: org-data keeps two roles separate — **admins manage policy, writers manage data** — and being an admin does not imply write access to any scope. The card you just read was written by the *contract* during `agent create`, not by you.

      To write it yourself, add your own DID to the `agent-cards` scope's writer list. One call, once per scope:

      ```bash theme={null}
      t3n org writers-add --org "$ORG_DID" --scope agent-cards --writer "$(t3n whoami)" --env testnet
      # writers updated for scope 'agent-cards'
      ```

      `card-set` then succeeds, and `card-get` returns the updated card. Check the list any time with `t3n org writers-get --org "$ORG_DID" --scope agent-cards`.

      <Note>
        The writer verbs need `@terminal3/t3n-sdk` **4.25.0 or newer** (`npx @terminal3/t3n-sdk` always runs the latest; a pinned older install won't have them). On an older CLI, grant it from the SDK — but `setWriters` **replaces** the list, so read it first and merge, or you will revoke every other writer on the scope:

        ```ts theme={null}
        import { SessionOrgDataClient, AGENT_CARDS_SCOPE } from "@terminal3/t3n-sdk";

        const orgData = new SessionOrgDataClient(t3n, nodeUrl); // authenticated as an org admin
        const { writers } = await orgData.writersGet({ orgDid, scope: AGENT_CARDS_SCOPE });
        await orgData.setWriters({
          orgDid,
          scope: AGENT_CARDS_SCOPE,
          writers: [...new Set([...writers, adminDid])],
        });
        ```
      </Note>
    </Warning>

    <Note>
      **Granting and revoking write access.** `writers-add` and `writers-remove` adjust the list and leave the other writers alone — the usual choice. `writers-set` **replaces** the whole list, so anyone you omit loses access; `writers-clear` removes everyone, leaving the scope unwritable until you grant again. All four require an org admin.

      `add` and `remove` read the current list and write back the result, so two admins editing the same scope at the same moment can overwrite each other. That's fine interactively; scripts that might race should use `writers-set` with the full intended list.
    </Note>

    <Note>
      Reads are metered too. If `card-get` returns `InsufficientCredit`, the account is simply out of credits — top up and retry; nothing is wrong with the card. Metering settles after the fact, so the writes in earlier steps can succeed and then leave the balance short for this read.
    </Note>

    <Tip>
      **Publishing for public discovery (optional).** To list the agent publicly — resolvable by anyone, without a key, at `GET /api/agent-card/<did>` — publish it explicitly: `t3n agent card-publish --owner "$ORG_DID" --agent "$AGENT_DID"`. Consent is already in place (the agent was minted with your organization linked), so it's a single call, reversible with `card-unpublish`. Most org-internal agents never need it.
    </Tip>

    <Accordion title="Under the Hood: where does the private card live?">
      The card is ordinary org-data: `create`/`card-set` store it in your organization's `agent-cards` scope on the built-in `tee:org-data/contracts` TEE contract, at a deterministic entry id derived from `(orgDid, agentDid)`. Reads (`card-get`) go through org-data's normal authorization — an org admin, or a holder of a delegation credential scoped to that read. It is never copied to the world-readable card map unless you explicitly publish it.
    </Accordion>
  </Step>
</Steps>

## What's next

* The agent now has an identity and a card. Next, let it actually *do* something — granting permission to act on users' data and contracts → [Agent Auth](/developers/adk/overview/agent-auth-adk) and [Delegate Access](/t3n/data-owner-guide/delegate-access)
* How DIDs work on T3N → [Decentralized Identifiers](/t3n/how-t3n-works/did)
* Provisioning and card writes consume credits → [Tokens](/t3n/how-t3n-works/tokens)

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Create Tenant KV Maps

A TEE contract needs one map before it can run: `secrets`, holding the API key. Create it with the `TenantClient`. The `tail` is the per-map local name; the host stores it as `z:<tid>:<tail>`.

```typescript theme={null}
await tenant.maps.create({
  tail: "secrets",
  visibility: "private",
  writers: { only: [contractId] },
  readers: { only: [contractId] },  // REQUIRED — the kv-governor denies reads when omitted
});
```

`readers` **must** be set explicitly — the KV governor defaults to **deny**, so leaving it off makes the contract's own secret read fail with `AccessDenied`. `MapAlreadyExists` is idempotent — safe to re-run when re-deploying.

**Map visibility quick reference:**

* `"private"` — only your contracts can access this map (default, use it for everything sensitive).
* `"public"` — world-readable via `/api/dev/public-kv/<tid>/<tail>`. Map tail must start with `public:`. Never put PII in a public map.

<Note>
  `writers`/`readers` restrict your **contracts**, not you. As the map's owner you can always write its entries directly via the control plane (`tenant.executeControl("map-entry-set", …)`), even on a `writers: { only: [contractId] }` map — that's how [seeding the API key](/developers/adk/tips/seed-api-key) works. A contract-only map is **not** tamper-proof against its owner; see [Storage Namespaces → Access model](/t3n/how-t3n-works/z-namespace#access-model).
</Note>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Seed API key into secrets map

> Seed the API key into the secrets map using the map-entry-set control call.

Your contract reads the API key from `z:<tid>:secrets` at runtime. There's no `set-credentials` function — the tenant SDK writes the key straight into the map with the `map-entry-set` control call, on the authenticated `tee:tenant/contracts` path (not an agent call).

```typescript theme={null}
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key:      "duffel_api_key",
  value:    process.env.DUFFEL_API_KEY!,
});

console.log("API key sealed in z:<tid>:secrets — not visible outside the TEE");
```

What happens:

1. `map-entry-set` writes the value into `z:<tid>:secrets`. It is a control-plane write, so it **bypasses the map's `writers` ACL** — the key lands even though the map is read/write-restricted to the contract alone (see [Create tenant KV maps](/developers/adk/tips/create-kv-maps)).
2. At call time your contract reads it back with `kv_store::get(&format!("z:{}:secrets", hex::encode(&tenant_did())), b"duffel_api_key")` inside the TDX enclave — `kv-store::get` takes the full canonical map name (not the bare tail) and a byte-string key.

The only path to the key is through your contract code — no external observer, not the agent, not the calling developer, can read it back out.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Capabilities come from your WIT imports

> Capabilities are determined by the host interfaces imported in your contract's world.wit

You don't declare capabilities in a manifest — there isn't one. What your TEE contract can do is decided in two places, both enforced inside the TEE at call time.

Your contract runs in one of the `tenant-*` linker worlds, chosen from the host interfaces it imports in `world.wit`. Import `http` and your contract is linked against the `tenant-http` world; import nothing beyond the base and you get `tenant-base` (`kv-store`, `logging`, `tenant-context`).

```wit theme={null}
world your-contract {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http@2.1.0;   // ← opting into outbound HTTP
}
```

On top of that, the TEE runtime enforces a capability ceiling — privileged interfaces (signing, user profile, …) are never linked into tenant worlds. See [Host API → z-namespace](/t3n/how-t3n-works/host-api) for the full list.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Outbound HTTP calls are authorized by the user, not the contract

Your TEE contract does not declare which hosts it may call. A tenant contract's outbound HTTP egress is resolved, on every call, from the **calling user's authorization grant** — the *allowed hosts* the user grants when they delegate to your agent or contract:

* **Delegated call** → the subject user's grant.
* **Direct (self) call** → the caller's own self-grant.

If the target host (for example `api.duffel.com`) isn't on the grant's allowed-hosts list, the contract still runs but the outbound call is denied with `host/http.egress_denied`.

<Warning>
  This is the most common reason a working contract can't reach its API: the code is fine, but no grant authorizes the host. Set the grant before you invoke — see [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract) and [Delegate access](/t3n/data-owner-guide/delegate-access).
</Warning>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Placeholders in outbound calls

> Send private data to a third-party API without it ever entering your contract, using http-with-placeholders.

When your contract needs to send private data (e.g., PII — name, date of birth, email, etc.) to a third-party API, it does **not** read the values and inline them. Instead it uses the **`http-with-placeholders`** host interface: you put `{{profile.<field>}}` markers in the request, and the host resolves them from the calling user's profile **inside the enclave**, just before the request goes out. The plaintext never enters your WASM.

```
  Agent  →  z:<tid>:contract              →  host (http-with-placeholders)  →  Duffel
   book-offer      templates {{profile.*}}        resolves the markers from        POST /orders
                   into the order body            the calling user's profile,      (real PII)
                                                  then sends the rendered request
   { id, pnr } ◀───────────────────────────────────────────────────────────────  { id, pnr }
```

Your contract in Rust:

```rust theme={null}
use crate::host::interfaces::http_with_placeholders as hwp;

// The {{profile.<path>}} markers are resolved host-side from the calling
// user's profile — this contract never sees the plaintext values.
let body = serde_json::json!({
    "data": {
        "type": "instant",
        "selected_offers": [req.offer_id],
        "passengers": [{
            "id": "passenger_0",
            "given_name":  "{{profile.first_name}}",
            "family_name": "{{profile.last_name}}",
            "born_on":     "{{profile.date_of_birth}}",
            "email":       "{{profile.verified_contacts.email.value}}",
        }]
    }
});

let resp = hwp::call(&hwp::Request {
    method:  "POST".to_string(),
    url:     "https://api.duffel.com/air/orders".to_string(),
    headers: vec![
        ("Authorization".to_string(), format!("Bearer {api_key}")),
        ("Duffel-Version".to_string(), "v2".to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
    ],
    payload: Some(serde_json::to_vec(&body)?),
})?;
// resp.payload — Duffel's response (booking id + PNR). The passport/name/DOB
// were substituted by the host; your WASM never held them.
```

Key points:

* **Synchronous.** Like plain `http`, you get the upstream response back in the same invocation — there's no deferred queue.
* **Profile access is gated by the user's delegation.** The markers resolve only when the calling agent is authorized to act for that user (see [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract)). A marker your contract isn't permitted to resolve fails with `placeholder not permitted: <marker>`.
* **Egress is the same rule as `http`.** The target host must be on the user's allowed-hosts grant, or the call is denied (`host/http.egress_denied`).
* **Markers reference the user profile schema** — e.g. `{{profile.first_name}}`, `{{profile.date_of_birth}}`, `{{profile.verified_contacts.email.value}}`. Fields the schema doesn't carry yet (passport, title) are supplied by your contract directly.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.terminal3.io/llms.txt>
> Use this file to discover all available pages before exploring further.

# Common errors

Errors come back as a JSON-RPC **`bad_request`** (HTTP 400) with `{ code: "bad_request", detail, request_id }`. The SDK throws with `detail` — a human-readable message string, **not** a typed error object. Match on the substring shown below.

User-authentication failures additionally carry a **machine code at the front** of `detail` (e.g. `eth_authenticator_limit: …`), so the SDK can branch with a single `startsWith`.

## Tenant operations — register, maps, dispatch

| You'll see in `detail`                                                            | Cause                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version <x> is not higher than current version <y>`                              | Re-registering a contract at a version that isn't greater than the deployed one                                                                                                                                | Bump the `version` passed to `contracts.register`                                                                                                                                                                                                                                                                                                |
| `map already exists`                                                              | Re-running `maps.create` against an already-provisioned tenant                                                                                                                                                 | Idempotent — safe to ignore on re-runs                                                                                                                                                                                                                                                                                                           |
| `map not found`                                                                   | A map tail in `kv_store::get` / `put` doesn't match what `maps.create` created                                                                                                                                 | Match the tails exactly between [Create tenant KV maps](/developers/adk/tips/create-kv-maps) and your Rust                                                                                                                                                                                                                                       |
| `canonical map name invalid: <reason>`                                            | `tail` is empty, contains `..`, or starts with `z:`                                                                                                                                                            | Pass only the local tail (e.g. `"secrets"`) — the SDK prefixes `z:<tid>:`                                                                                                                                                                                                                                                                        |
| `quota exceeded: <dim>` (e.g. `quota exceeded: max_contracts`)                    | Hit a per-tenant quota                                                                                                                                                                                         | Ask the cluster operator to raise the quota                                                                                                                                                                                                                                                                                                      |
| `access denied: <caller> cannot <op> map "<map>"`                                 | The contract isn't on the map's `readers` / `writers` ACL                                                                                                                                                      | `tenant.maps.update` to add the contract id to `readers` / `writers`                                                                                                                                                                                                                                                                             |
| `tenant is suspended`                                                             | The operator suspended your tenant                                                                                                                                                                             | Ask the operator to resume                                                                                                                                                                                                                                                                                                                       |
| `host/http.egress_denied: host '<host>' is not in the authorised_hosts allowlist` | The contract called a host the caller's `agent_auth` grant doesn't authorize                                                                                                                                   | Add the host to the user's grant (see [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract))                                                                                                                                                                                                                           |
| `InsufficientCreditError` on a metered function call from an **agent** identity   | Metered calls are charged against the **calling identity's own** T3N credit balance — an agent DID's balance is separate from its tenant's, and starts at zero even when the tenant has plenty of test tokens. | Self-serve fix: get the agent its **own** key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) — same as any other T3N identity — which issues test credits along with it. A key generated any other way starts at zero. See [Register a Public Agent](/developers/agents/register-agent) for the full flow. |

<Note>
  Contract-authored errors are whatever **your** contract returns. The flight
  example, for instance, surfaces `duffel_api_key not found in z:<tid>:secrets —
    populate it via the tenant SDK` when the `secrets` map wasn't seeded (see
  [Seed API key into secrets map](/developers/adk/tips/seed-api-key)) — that's
  the contract's own message, not a platform error.
</Note>

## Generic / opaque failures (HTTP 500, no clear cause)

A `bad_request` gives you a substring to match on. A bare **`HTTP 500`** with no further detail is a different situation — it usually isn't your contract logic. Before assuming it's a bug in your code, check these in order:

1. **Grab the `request_id`.** Most 500 responses still include one — save it before you start changing code. If you end up asking for help, it's the single most useful thing you can hand over.
2. **Re-check egress and ACLs first.** A missing outbound-host grant or a missing map ACL entry can surface as a 500 instead of the more specific error you'd expect — re-read the [egress](/developers/adk/tips/outbound-http-auth-by-user) and [map ACL](/developers/adk/tips/create-kv-maps) requirements before looking further.
3. **Retry once, deliberately.** A single unhealthy node can return a 500 for requests that are otherwise correct. If an identical request succeeds on retry, it was very likely transient — no code change needed.
4. **If it's consistent and reproducible**, it's more likely a platform-side issue than your integration. Report it in the [developer Telegram](https://t.me/terminal3developer) with the `request_id`, rather than spending hours guessing at workarounds.

## Common integration gotchas

These aren't errors with a fixed message — they're patterns that produce confusing behavior downstream, reported independently by multiple teams.

| Gotcha                                                     | What happens                                                                                                                                                                                                                                                                                                                                                   | Fix                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Using `tenant_did()`'s return value directly in a map path | `tenant_did()` returns raw bytes (`list<u8>`), not a string. Using it directly (or formatting it with `{}`) is wrong and won't compile against a `String` map path — it must be hex-encoded first.                                                                                                                                                             | Hex-encode it: `format!("z:{}:secrets", hex::encode(&tenant_did()))` — this matches the map the tenant SDK created.          |
| Omitting `baseUrl` when constructing a `TenantClient`      | `TenantClient`'s config accepts `baseUrl` as an optional field, but calls can still fail at request time without it, even after calling `setEnvironment()`. This is specific to `TenantClient` — `T3nClient` (used for tenant, agent, and user sessions in the walkthrough) doesn't take a `baseUrl` at all; it's always resolved from the active environment. | When constructing a `TenantClient`, always pass `baseUrl: getNodeUrl()` explicitly rather than relying on it being inferred. |

## Authentication & wallet linking

These come from the user/session contract during sign-in and `addAuthMethod`, with the code at the **front** of `detail`:

| Code (prefix of `detail`) | When                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `eth_authenticator_limit` | Hit the cap on wallets linked to one DID (e.g. trying to add an 11th)       |
| `eth_auth_map_conflict`   | The wallet is already linked to a different DID — resolve via account merge |
| `email_not_verified`      | A profile upsert ran before the email OTP was verified                      |
| `user_not_found`          | The DID has no profile yet                                                  |
| `legacy_field`            | A pre-2.0.0 dispatch field was sent (e.g. `otp_code` on `user-upsert`)      |
