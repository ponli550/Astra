//! Consent policy, enforced by this contract inside the enclave.
//!
//! # Why the contract decides, rather than the delegation layer
//!
//! The platform's enforcement point for a tenant contract is egress: a
//! delegation grant names functions, but the reference implementation
//! revokes access by clearing allowed hosts and leaves the function
//! list populated, because the function still runs and only its
//! outbound call is denied. This contract makes no outbound call, so
//! there is nothing there for the platform to deny. Verified against
//! testnet: with the grant fully revoked, reads still succeeded.
//!
//! So the gate has to be a comparison this code makes.
//!
//! # Why that is enforcement and not merely intent
//!
//! Every value the decision rests on is minted by the node and cannot
//! be influenced by the caller:
//!
//!   * the calling identity comes from `tenant-context`, never from the
//!     request body, so a caller cannot claim to be someone else;
//!   * the clock is the cluster-pinned timestamp, not wall clock, so a
//!     caller cannot move an expiry.
//!
//! # What it does not claim
//!
//! Whoever can write the tenant's maps can rewrite this policy. The
//! guarantee is narrower and still worth having: a call cannot reach the
//! data without passing this check, and cannot pass it without being
//! recorded.

use serde::{Deserialize, Serialize};

/// The consent document, stored as one JSON value in the `policy` map.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    /// Hex-encoded caller DIDs permitted to call at all. Empty denies
    /// everyone, which is the correct reading of "consent withdrawn"
    /// rather than an error.
    #[serde(default)]
    pub allowed_callers: Vec<String>,
    /// Function names those callers may invoke.
    #[serde(default)]
    pub allowed_functions: Vec<String>,
    /// When permission lapses. Absent means no expiry.
    #[serde(default)]
    pub valid_until_secs: Option<u64>,
    /// Bumped on each write and recorded in the audit trail, so a
    /// widening of permission is as visible as a use of it.
    #[serde(default)]
    pub version: u32,
}

impl Policy {
    /// The posture before any policy is written: deny everything.
    ///
    /// A missing document must not mean "allow", or forgetting to
    /// provision the map would silently disable the gate.
    pub fn deny_all() -> Self {
        Self {
            allowed_callers: Vec::new(),
            allowed_functions: Vec::new(),
            valid_until_secs: None,
            version: 0,
        }
    }
}

/// Why a call was refused. Carried into the response and the audit entry.
#[derive(Debug, PartialEq, Eq)]
pub enum Denial {
    NoPolicy,
    CallerNotListed,
    FunctionNotListed,
    Expired { valid_until_secs: u64, now_secs: u64 },
}

impl Denial {
    pub fn reason(&self) -> String {
        match self {
            Denial::NoPolicy => "no consent policy is in force".to_string(),
            Denial::CallerNotListed => "this caller is not permitted by the consent policy".to_string(),
            Denial::FunctionNotListed => {
                "the consent policy does not permit this function".to_string()
            }
            Denial::Expired {
                valid_until_secs,
                now_secs,
            } => format!(
                "consent lapsed at {valid_until_secs}, cluster time is {now_secs}"
            ),
        }
    }
}

/// Evaluate a call against the policy.
///
/// Checks run cheapest-first and refuse before anything reads data. The
/// order also decides which reason a caller learns, so it goes from the
/// least informative to the most: that a caller is unlisted reveals less
/// than which functions exist.
pub fn evaluate(
    policy: &Policy,
    caller_hex: &str,
    function: &str,
    now_secs: u64,
) -> Result<(), Denial> {
    if policy.version == 0 && policy.allowed_callers.is_empty() {
        return Err(Denial::NoPolicy);
    }

    // Compare case-insensitively: a DID's identity is the bytes it
    // decodes to, not the spelling of its hex.
    let listed = policy
        .allowed_callers
        .iter()
        .any(|c| c.eq_ignore_ascii_case(caller_hex));
    if !listed {
        return Err(Denial::CallerNotListed);
    }

    if !policy.allowed_functions.iter().any(|f| f == function) {
        return Err(Denial::FunctionNotListed);
    }

    if let Some(until) = policy.valid_until_secs {
        if now_secs >= until {
            return Err(Denial::Expired {
                valid_until_secs: until,
                now_secs,
            });
        }
    }

    Ok(())
}

pub const POLICY_KEY: &[u8] = b"consent";

#[cfg(target_arch = "wasm32")]
use crate::host::interfaces::kv_store;

/// Load the policy. An absent or unreadable document denies everything
/// rather than failing the call, so the gate stays closed either way and
/// the attempt is still recorded.
#[cfg(target_arch = "wasm32")]
pub fn load() -> Result<Policy, String> {
    let map = crate::map_name(crate::POLICY_TAIL);
    let found = kv_store::get(&map, POLICY_KEY).map_err(|e| format!("policy read {map}: {e}"))?;
    match found {
        None => Ok(Policy::deny_all()),
        Some(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_else(|_| Policy::deny_all())),
    }
}

#[cfg(target_arch = "wasm32")]
pub fn store(policy: &Policy) -> Result<(), String> {
    let map = crate::map_name(crate::POLICY_TAIL);
    let value = serde_json::to_vec(policy).map_err(|e| e.to_string())?;
    kv_store::put(&map, POLICY_KEY, &value).map_err(|e| format!("policy write {map}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> Policy {
        Policy {
            allowed_callers: vec!["abe8e6dc".to_string()],
            allowed_functions: vec!["vault-read".to_string()],
            valid_until_secs: Some(1000),
            version: 1,
        }
    }

    #[test]
    fn allows_a_listed_caller_and_function_before_expiry() {
        assert!(evaluate(&policy(), "abe8e6dc", "vault-read", 999).is_ok());
    }

    #[test]
    fn a_missing_policy_denies_rather_than_allows() {
        // Forgetting to provision the map must not disable the gate.
        let err = evaluate(&Policy::deny_all(), "abe8e6dc", "vault-read", 1).unwrap_err();
        assert_eq!(err, Denial::NoPolicy);
    }

    #[test]
    fn denies_an_unlisted_caller() {
        let err = evaluate(&policy(), "deadbeef", "vault-read", 1).unwrap_err();
        assert_eq!(err, Denial::CallerNotListed);
    }

    #[test]
    fn denies_a_function_the_policy_does_not_name() {
        // This is the check the delegation grant failed to make.
        let err = evaluate(&policy(), "abe8e6dc", "vault-put", 1).unwrap_err();
        assert_eq!(err, Denial::FunctionNotListed);
    }

    #[test]
    fn denies_once_consent_has_lapsed() {
        let err = evaluate(&policy(), "abe8e6dc", "vault-read", 1000).unwrap_err();
        assert!(matches!(err, Denial::Expired { .. }));
        // The boundary is exclusive: at exactly the expiry it is over.
        assert!(evaluate(&policy(), "abe8e6dc", "vault-read", 1001).is_err());
    }

    #[test]
    fn treats_hex_case_as_the_same_identity() {
        // A DID's identity is the bytes it decodes to, not its spelling.
        assert!(evaluate(&policy(), "ABE8E6DC", "vault-read", 1).is_ok());
    }

    #[test]
    fn an_emptied_caller_list_denies_everyone() {
        // This is what withdrawing consent looks like on the wire.
        let mut p = policy();
        p.allowed_callers.clear();
        p.version = 2;
        let err = evaluate(&p, "abe8e6dc", "vault-read", 1).unwrap_err();
        assert_eq!(err, Denial::CallerNotListed);
    }

    #[test]
    fn no_expiry_means_it_does_not_lapse() {
        let mut p = policy();
        p.valid_until_secs = None;
        assert!(evaluate(&p, "abe8e6dc", "vault-read", u64::MAX).is_ok());
    }
}
