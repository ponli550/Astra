# Consent Vault

**An AI agent reads your data only while you allow it, and the hardware writes
the receipt.** A Rust contract running inside confidential-computing hardware on
the [T3 Network](https://docs.terminal3.io) evaluates a consent policy before
every access, refuses what the policy does not cover, and records each attempt
with provenance the caller cannot forge.

Built for the T3 Agent Developer Kit hackathon. Track: **private data access
with auditable consent**.

## Two minutes of it working 🎬

![Agent beside the owner's console](docs/media/demo-agent.gif)

*Real run against testnet, nothing staged. Left, an agent reads the record
under live consent and reports it. Right, the owner withdraws consent with one
key. The agent asks again and is refused inside the enclave. Notice the agent
guesses at the reason, while the console shows the actual cause: the policy
went to zero callers. Left is what the agent claims. Right is what the enclave
recorded.*

The agent is [OpenCode](https://opencode.ai) on a free model, driving the vault
through Model Context Protocol tools. The console is `npm run monitor`. The
recording is generated from [docs/demo-agent.tape](docs/demo-agent.tape), so it
re-renders when the code changes rather than going stale.

A scripts-only run of the same sequence is at
[docs/media/demo.gif](docs/media/demo.gif), and a spoken walkthrough script is
in [docs/narration.md](docs/narration.md).

## The claim, stated narrowly

A call cannot reach the data without passing a check inside the enclave, and
cannot pass it without leaving a record the enclave wrote.

That is deliberately narrower than "your data is safe". Whoever can write the
tenant's maps can rewrite the policy, so this is not protection from the
operator. What it removes is the need to trust the agent's own account of what
it did.

## How it works

```
opencode                 decides what to do          holds a model, no network identity
  spawns
src/mcp/server.ts        acts on that decision       holds the caller's key
  calls
z:<tenant>:consent-vault evaluates consent, audits   runs inside the enclave
  reads
z:<tenant>:vault         the records
z:<tenant>:policy        who may call what, until when
z:<tenant>:audit         what was attempted, and how it went
```

Every value the access decision rests on is minted by the node, not supplied by
the caller:

- **The calling identity** comes from the host's tenant context, never from the
  request body, so a caller cannot claim to be someone else.
- **The clock** is the cluster-pinned timestamp, so a caller cannot move an
  expiry.
- **Policy administration** is restricted to the tenant identity by comparing
  two node-minted values.

Three further design points that took a wrong turn to find:

**Denials return successfully.** The host rolls back everything a failed call
wrote, an audit append included, so a refusal raised as an error would erase its
own record and leave a trail of successes only.

**The audit write shares the read's transaction.** A read that is not recorded
cannot commit.

**Two layers, and which one decides depends on who is calling.** On a
self-call, where the caller is the data owner, the platform's delegation grant
is not consulted and the contract's policy is the only gate. Verified: with the
grant fully revoked, the owner's own reads still succeeded. On a delegated call,
where an agent acts for the owner, the platform checks the owner's grant per
function *before dispatch* and refuses with `function_not_delegated`. Verified
live with two funded agents. So the grant is a real, flat, owner-issued gate on
agents, and the contract's policy adds the chain and the narrowing on top of it.
Both must pass.

**The caller is read from the node-minted context, not from `calling-user-did`.**
On a delegated call the host's tenant-context reports the *subject*, the owner
whose data it is, not the agent doing the calling. The agent is only visible as
`authenticated_did` inside the context bytes every function receives. Keying
consent on the wrong field made an agent's read look like the owner's own. The
trail now records both: who called, and for whom.

**Grants are unpinned.** A grant pinned to the exact contract version at issue
time stops matching on the next redeploy and every delegated call then fails
before dispatch. The reference demo grants unpinned for the same reason.

## Consent chains

A root caller may hand part of its permission to another identity. The
delegatee holds the **intersection** of what it was given and what its
delegator still holds, resolved back to the root at every call. Two properties
fall out of that definition rather than being enforced separately:

- **Nobody can hand on more than they hold.** A widening attempt is refused
  inside the enclave at the moment of delegation, and recorded. Even a widened
  delegation that somehow reached storage would confer nothing at use.
- **Withdrawing consent at the root empties every chain beneath it**, with
  nothing deleted. An intersection with nothing is nothing.

Verified live on testnet with three funded identities. The owner granted agent
A. A read the record and was stopped from writing by the platform. A handed
agent B `vault-read` only, and was refused inside the enclave when it tried to
hand on `vault-put`. B read under that handoff, attributed in the trail as B
acting for the owner. The owner withdrew the root, and both agents' next reads
were refused.

Org-minted agents start at zero balance and every call bills the caller, so the
live run used agents claimed from the claim page with separate work emails,
which arrive funded. That is the vendor's documented route for agent keys.

```bash
npm run policy:allow                    # owner signs; names agent A as root
npm run delegate                        # A hands agent B vault-read only
npm run delegate -- widen               # A tries to add vault-put; refused
CALLER=second npm run invoke            # B reads under the delegation
npm run policy:deny                     # root withdrawn; A and B both refused
```

## Run it

```bash
cp .env.example .env      # T3N_API_KEY and DID from the claim page
npm install
npm run whoami            # confirms the identity before spending credits
npm run contract:build
npm run deploy
npm run demo              # the whole sequence, about seventy seconds
```

Then, for the live view:

```bash
npm run monitor           # the owner's console, [r] withdraws consent
opencode                  # agent tools appear automatically
```

Full setup notes, the failure modes worth knowing, and what is *not* enforced
are in [SCAFFOLD.md](SCAFFOLD.md).

## Built with

| Layer | Choice |
| --- | --- |
| Enclave logic | Rust 1.98 to WebAssembly System Interface Preview 2, via `wit-bindgen` |
| Network | Terminal 3 SDK 5.2, pinned |
| Agent tools | Model Context Protocol, driven by OpenCode |
| Console | Ink and React, rendering to the terminal |
| Tests | `cargo test` for the contract, Node's test runner for the console |

No server, no database, no model API key. State lives in the tenant's maps
inside the network.

Vendor documentation for the developer kit is kept verbatim at
[docs/t3n-adk-reference.md](docs/t3n-adk-reference.md).
