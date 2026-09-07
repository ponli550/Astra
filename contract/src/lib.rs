//! z-tenant-consent v0.1.0 — auditable-consent data vault.
//!
//! Demonstrates the T3N delegated-access model with no third-party
//! dependency:
//!
//!   * `vault-put`  — seed a sensitive record into the tenant vault.
//!   * `vault-read` — read one record. Refuses unless the node bound a
//!     calling user to this execution, and writes an audit entry in the
//!     SAME transaction as the read, so an access that is not recorded
//!     cannot commit.
//!   * `audit-list` — enumerate the audit trail in sequence order.
//!
//! What makes the read gated is NOT this code: the host resolves the
//! calling user's delegation grant before dispatch, and refuses a
//! function the grant does not name. This contract's job is to prove
//! *who* asked and to leave a record that cannot be separated from the
//! access itself.
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "tenant-consent",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

pub mod audit;
pub mod vault;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::tenant_consent::contracts::Guest for Component {
    fn vault_put(
        req: exports::z::tenant_consent::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("vault-put: missing input")?;
        vault::vault_put(&input)
    }

    fn vault_read(
        req: exports::z::tenant_consent::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("vault-read: missing input")?;
        vault::vault_read(&input)
    }

    fn audit_list(
        req: exports::z::tenant_consent::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        // audit-list takes an optional body: an absent input means "defaults".
        let input = req.input.unwrap_or_else(|| b"{}".to_vec());
        audit::audit_list(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

/// Map tails this contract touches. The host stores them as
/// `z:<tid>:<tail>`; `map_name` builds the full canonical name at
/// runtime from `tenant-context`.
pub const VAULT_TAIL: &str = "vault";
pub const AUDIT_TAIL: &str = "audit";

/// Build the full canonical KV map name for a tail.
///
/// `kv-store` takes the FULL `z:<tid>:<tail>` name, never the bare
/// tail. `tenant_did()` returns raw bytes, so it must be hex-encoded
/// first — formatting the bytes directly is the single most common
/// integration bug here.
#[cfg(target_arch = "wasm32")]
pub fn map_name(tail: &str) -> alloc::string::String {
    let tid = host::tenant::tenant_context::tenant_did();
    alloc::format!("z:{}:{}", hex::encode(&tid), tail)
}

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_semver() {
        let parts: alloc::vec::Vec<&str> = CONTRACT_VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "CONTRACT_VERSION must be MAJOR.MINOR.PATCH");
        for part in parts {
            assert!(part.parse::<u32>().is_ok(), "each part must be numeric");
        }
    }
}
