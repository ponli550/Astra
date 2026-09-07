//! Consent policy, enforced by this contract inside the enclave, with
//! delegation chains that narrow and revoke by construction.
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
//! # Chains
//!
//! A root caller, one the owner listed directly, may delegate to another
//! identity. The delegatee's effective permission is the intersection of
//! what it was given and what its delegator itself still holds, resolved
//! back to the root at every call. Two consequences fall out of that
//! definition rather than being enforced separately:
//!
//!   * nobody can hand on more than they hold, because the intersection
//!     cannot exceed either operand;
//!   * withdrawing consent at the root empties every chain beneath it,
//!     because an intersection with nothing is nothing.
//!
//! # What it does not claim
//!
//! Whoever can write the tenant's maps can rewrite this policy. The
//! guarantee is narrower and still worth having: a call cannot reach the
//! data without passing this check, and cannot pass it without being
//! recorded.

use serde::{Deserialize, Serialize};

/// Longest permitted chain below the root: owner -> A -> B. Deep chains
/// are hard to reason about for the owner, and the cap also bounds the
/// resolver's work per call.
pub const MAX_DEPTH: u32 = 2;

/// One handoff. `from` must itself be permitted at the time of use, or
/// the delegation confers nothing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Delegation {
    /// Hex DID of the delegator.
    pub from: String,
    /// Hex DID of the delegatee.
    pub to: String,
    /// Functions handed on. Intersected with the delegator's own at use.
    pub functions: Vec<String>,
    /// Optional cutoff. Intersected (min) with the delegator's own at use.
    #[serde(default)]
    pub valid_until_secs: Option<u64>,
}

/// The consent document, stored as one JSON value in the `policy` map.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    /// Hex-encoded caller DIDs permitted directly by the owner. Empty
    /// denies everyone, which is the correct reading of "consent
    /// withdrawn" rather than an error.
    #[serde(default)]
    pub allowed_callers: Vec<String>,
    /// Function names root callers may invoke.
    #[serde(default)]
    pub allowed_functions: Vec<String>,
    /// When root permission lapses. Absent means no expiry.
    #[serde(default)]
    pub valid_until_secs: Option<u64>,
    /// Handoffs beneath the root. Cleared whenever the owner rewrites
    /// the document, so a fresh root consent starts with no chains.
    #[serde(default)]
    pub delegations: Vec<Delegation>,
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
            delegations: Vec::new(),
            version: 0,
        }
    }
}

/// What a caller may do right now, after resolving its chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Effective {
    pub functions: Vec<String>,
    pub valid_until_secs: Option<u64>,
    /// 0 for a root caller, 1 for its delegatee, and so on.
    pub depth: u32,
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
            Denial::CallerNotListed => {
                "this caller is not permitted by the consent policy".to_string()
            }
            Denial::FunctionNotListed => {
                "the consent policy does not permit this function".to_string()
            }
            Denial::Expired {
                valid_until_secs,
                now_secs,
            } => format!("consent lapsed at {valid_until_secs}, cluster time is {now_secs}"),
        }
    }
}

fn same_did(a: &str, b: &str) -> bool {
    // A DID's identity is the bytes it decodes to, not the spelling of
    // its hex.
    a.eq_ignore_ascii_case(b)
}

fn min_expiry(a: Option<u64>, b: Option<u64>) -> Option<u64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (Some(x), None) | (None, Some(x)) => Some(x),
        (None, None) => None,
    }
}

fn intersect(a: &[String], b: &[String]) -> Vec<String> {
    a.iter().filter(|f| b.contains(f)).cloned().collect()
}

/// Resolve what `caller` effectively holds, walking delegations back to
/// the root and intersecting at each step.
///
/// Returns `None` when the caller has no path to a listed root. A
/// delegation whose delegator is unlisted, expired, or itself resolves
/// to nothing confers nothing, which is what makes revocation cascade.
pub fn effective(policy: &Policy, caller: &str, now_secs: u64) -> Option<Effective> {
    fn walk(policy: &Policy, who: &str, now: u64, depth: u32, seen: &mut Vec<String>) -> Option<Effective> {
        if policy.allowed_callers.iter().any(|c| same_did(c, who)) {
            return Some(Effective {
                functions: policy.allowed_functions.clone(),
                valid_until_secs: policy.valid_until_secs,
                depth: 0,
            });
        }
        if depth >= MAX_DEPTH {
            return None;
        }
        if seen.iter().any(|s| same_did(s, who)) {
            return None; // cycle: A -> B -> A confers nothing
        }
        seen.push(who.to_string());

        // Several delegators may have handed to the same identity. Any
        // one live chain is enough; take the first that resolves.
        for d in policy.delegations.iter().filter(|d| same_did(&d.to, who)) {
            if let Some(upstream) = walk(policy, &d.from, now, depth + 1, seen) {
                // The delegator must itself be within time at the moment
                // of use, or its handoffs are dead too.
                if let Some(until) = upstream.valid_until_secs {
                    if now >= until {
                        continue;
                    }
                }
                let functions = intersect(&d.functions, &upstream.functions);
                if functions.is_empty() {
                    continue;
                }
                return Some(Effective {
                    functions,
                    valid_until_secs: min_expiry(d.valid_until_secs, upstream.valid_until_secs),
                    depth: upstream.depth + 1,
                });
            }
        }
        None
    }
    let mut seen = Vec::new();
    walk(policy, caller, now_secs, 0, &mut seen)
}

/// Evaluate a call against the policy.
///
/// Checks run cheapest-first and refuse before anything reads data. The
/// order also decides which reason a caller learns, so it goes from the
/// least informative to the most: that a caller is unlisted reveals less
/// than which functions exist.
pub fn evaluate(policy: &Policy, caller_hex: &str, function: &str, now_secs: u64) -> Result<(), Denial> {
    if policy.version == 0 && policy.allowed_callers.is_empty() {
        return Err(Denial::NoPolicy);
    }

    let held = effective(policy, caller_hex, now_secs).ok_or(Denial::CallerNotListed)?;

    if !held.functions.iter().any(|f| f == function) {
        return Err(Denial::FunctionNotListed);
    }

    if let Some(until) = held.valid_until_secs {
        if now_secs >= until {
            return Err(Denial::Expired {
                valid_until_secs: until,
                now_secs,
            });
        }
    }

    Ok(())
}

/// Why a delegation was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum DelegateError {
    /// The delegator holds nothing right now, so has nothing to hand on.
    DelegatorNotPermitted(Denial),
    /// A named function is outside what the delegator holds.
    Widens(String),
    /// A later cutoff than the delegator's own.
    OutlivesDelegator { delegator_until: u64, requested: Option<u64> },
    /// Handing to oneself is meaningless and would seed a cycle.
    SelfDelegation,
    /// The delegator is already at the maximum depth.
    TooDeep { depth: u32 },
    /// Nothing named.
    Empty,
}

impl DelegateError {
    pub fn reason(&self) -> String {
        match self {
            DelegateError::DelegatorNotPermitted(d) => format!("delegator holds nothing to hand on: {}", d.reason()),
            DelegateError::Widens(f) => format!("cannot hand on '{f}': the delegator does not hold it"),
            DelegateError::OutlivesDelegator { delegator_until, requested } => format!(
                "cannot hand on past the delegator's own cutoff {delegator_until} (requested {})",
                requested.map(|v| v.to_string()).unwrap_or_else(|| "no expiry".to_string())
            ),
            DelegateError::SelfDelegation => "cannot delegate to oneself".to_string(),
            DelegateError::TooDeep { depth } => format!("chain would exceed the maximum depth of {MAX_DEPTH} (delegator is at depth {depth})"),
            DelegateError::Empty => "a delegation must name at least one function".to_string(),
        }
    }
}

/// Validate a proposed handoff against what the delegator holds now.
///
/// Narrowing is enforced here, at the moment of delegation, so a widening
/// attempt is refused and recorded rather than stored and silently
/// ignored. It is enforced again at every call by `effective`, so a
/// stored delegation that somehow widened would still confer nothing.
pub fn validate_delegation(
    policy: &Policy,
    from: &str,
    to: &str,
    functions: &[String],
    valid_until_secs: Option<u64>,
    now_secs: u64,
) -> Result<Effective, DelegateError> {
    if same_did(from, to) {
        return Err(DelegateError::SelfDelegation);
    }
    if functions.is_empty() {
        return Err(DelegateError::Empty);
    }

    let held = effective(policy, from, now_secs).ok_or(DelegateError::DelegatorNotPermitted(Denial::CallerNotListed))?;
    if let Some(until) = held.valid_until_secs {
        if now_secs >= until {
            return Err(DelegateError::DelegatorNotPermitted(Denial::Expired {
                valid_until_secs: until,
                now_secs,
            }));
        }
    }
    if held.depth >= MAX_DEPTH {
        return Err(DelegateError::TooDeep { depth: held.depth });
    }

    if let Some(f) = functions.iter().find(|f| !held.functions.contains(f)) {
        return Err(DelegateError::Widens(f.clone()));
    }

    if let Some(delegator_until) = held.valid_until_secs {
        match valid_until_secs {
            Some(requested) if requested <= delegator_until => {}
            other => {
                return Err(DelegateError::OutlivesDelegator {
                    delegator_until,
                    requested: other,
                })
            }
        }
    }

    Ok(held)
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

    const OWNER_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const AGENT_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const AGENT_C: &str = "cccccccccccccccccccccccccccccccccccccccc";

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    fn root() -> Policy {
        Policy {
            allowed_callers: s(&[OWNER_A]),
            allowed_functions: s(&["vault-read", "audit-list"]),
            valid_until_secs: Some(1000),
            delegations: Vec::new(),
            version: 1,
        }
    }

    fn with_chain() -> Policy {
        let mut p = root();
        p.delegations.push(Delegation {
            from: OWNER_A.into(),
            to: AGENT_B.into(),
            functions: s(&["vault-read"]),
            valid_until_secs: Some(800),
        });
        p
    }

    // ----- root behaviour, unchanged -----

    #[test]
    fn allows_a_listed_caller_and_function_before_expiry() {
        assert!(evaluate(&root(), OWNER_A, "vault-read", 999).is_ok());
    }

    #[test]
    fn a_missing_policy_denies_rather_than_allows() {
        let err = evaluate(&Policy::deny_all(), OWNER_A, "vault-read", 1).unwrap_err();
        assert_eq!(err, Denial::NoPolicy);
    }

    #[test]
    fn denies_an_unlisted_caller() {
        assert_eq!(evaluate(&root(), AGENT_B, "vault-read", 1).unwrap_err(), Denial::CallerNotListed);
    }

    #[test]
    fn denies_a_function_the_policy_does_not_name() {
        assert_eq!(evaluate(&root(), OWNER_A, "vault-put", 1).unwrap_err(), Denial::FunctionNotListed);
    }

    #[test]
    fn denies_once_consent_has_lapsed() {
        assert!(matches!(evaluate(&root(), OWNER_A, "vault-read", 1000).unwrap_err(), Denial::Expired { .. }));
    }

    #[test]
    fn treats_hex_case_as_the_same_identity() {
        assert!(evaluate(&root(), &OWNER_A.to_uppercase(), "vault-read", 1).is_ok());
    }

    // ----- chains -----

    #[test]
    fn a_delegatee_gets_the_intersection_not_the_gift() {
        let p = with_chain();
        let held = effective(&p, AGENT_B, 1).unwrap();
        assert_eq!(held.functions, s(&["vault-read"]));
        // The tighter of the two cutoffs wins.
        assert_eq!(held.valid_until_secs, Some(800));
        assert_eq!(held.depth, 1);
        assert!(evaluate(&p, AGENT_B, "vault-read", 1).is_ok());
        assert_eq!(evaluate(&p, AGENT_B, "audit-list", 1).unwrap_err(), Denial::FunctionNotListed);
    }

    #[test]
    fn a_stored_delegation_cannot_widen_at_use() {
        // Even if a widened delegation somehow reached storage, use-time
        // intersection strips what the delegator never held.
        let mut p = root();
        p.delegations.push(Delegation {
            from: OWNER_A.into(),
            to: AGENT_B.into(),
            functions: s(&["vault-read", "vault-put"]),
            valid_until_secs: None,
        });
        let held = effective(&p, AGENT_B, 1).unwrap();
        assert_eq!(held.functions, s(&["vault-read"]));
        assert_eq!(held.valid_until_secs, Some(1000), "inherits the root cutoff");
        assert_eq!(evaluate(&p, AGENT_B, "vault-put", 1).unwrap_err(), Denial::FunctionNotListed);
    }

    #[test]
    fn revoking_the_root_kills_the_whole_chain() {
        // This is the property that matters: nothing is deleted, the
        // delegation row is still there, and it confers nothing.
        let mut p = with_chain();
        p.allowed_callers.clear();
        p.version = 2;
        assert_eq!(p.delegations.len(), 1);
        assert_eq!(evaluate(&p, AGENT_B, "vault-read", 1).unwrap_err(), Denial::CallerNotListed);
    }

    #[test]
    fn an_expired_delegator_confers_nothing() {
        let p = with_chain();
        // Root lapses at 1000; B's own cutoff is 800. At 900 B is already
        // past its own cutoff; at 1000 the root is gone as well.
        assert!(matches!(evaluate(&p, AGENT_B, "vault-read", 900).unwrap_err(), Denial::Expired { .. }));
        assert_eq!(evaluate(&p, AGENT_B, "vault-read", 1000).unwrap_err(), Denial::CallerNotListed);
    }

    #[test]
    fn a_second_hop_intersects_again_and_hits_the_depth_cap() {
        let mut p = with_chain();
        p.delegations.push(Delegation {
            from: AGENT_B.into(),
            to: AGENT_C.into(),
            functions: s(&["vault-read"]),
            valid_until_secs: Some(500),
        });
        let held = effective(&p, AGENT_C, 1).unwrap();
        assert_eq!(held.depth, 2);
        assert_eq!(held.valid_until_secs, Some(500));
        assert!(evaluate(&p, AGENT_C, "vault-read", 1).is_ok());
        // C may not hand on further: depth 2 is the cap.
        let err = validate_delegation(&p, AGENT_C, OWNER_A, &s(&["vault-read"]), Some(400), 1).unwrap_err();
        assert_eq!(err, DelegateError::TooDeep { depth: 2 });
    }

    #[test]
    fn a_cycle_confers_nothing_and_terminates() {
        let mut p = Policy::deny_all();
        p.version = 1;
        p.delegations.push(Delegation { from: AGENT_B.into(), to: AGENT_C.into(), functions: s(&["vault-read"]), valid_until_secs: None });
        p.delegations.push(Delegation { from: AGENT_C.into(), to: AGENT_B.into(), functions: s(&["vault-read"]), valid_until_secs: None });
        assert!(effective(&p, AGENT_B, 1).is_none());
        assert!(effective(&p, AGENT_C, 1).is_none());
    }

    // ----- validating a proposed handoff -----

    #[test]
    fn delegation_of_a_subset_is_accepted() {
        let held = validate_delegation(&root(), OWNER_A, AGENT_B, &s(&["vault-read"]), Some(800), 1).unwrap();
        assert_eq!(held.depth, 0);
    }

    #[test]
    fn delegation_refuses_to_widen() {
        let err = validate_delegation(&root(), OWNER_A, AGENT_B, &s(&["vault-read", "vault-put"]), Some(800), 1).unwrap_err();
        assert_eq!(err, DelegateError::Widens("vault-put".into()));
    }

    #[test]
    fn delegation_refuses_to_outlive_the_delegator() {
        let err = validate_delegation(&root(), OWNER_A, AGENT_B, &s(&["vault-read"]), Some(5000), 1).unwrap_err();
        assert!(matches!(err, DelegateError::OutlivesDelegator { delegator_until: 1000, .. }));
        // No cutoff at all is also longer than a bounded delegator.
        let err = validate_delegation(&root(), OWNER_A, AGENT_B, &s(&["vault-read"]), None, 1).unwrap_err();
        assert!(matches!(err, DelegateError::OutlivesDelegator { requested: None, .. }));
    }

    #[test]
    fn an_unbounded_delegator_may_hand_on_unbounded() {
        let mut p = root();
        p.valid_until_secs = None;
        assert!(validate_delegation(&p, OWNER_A, AGENT_B, &s(&["vault-read"]), None, 1).is_ok());
    }

    #[test]
    fn delegation_by_someone_holding_nothing_is_refused() {
        let err = validate_delegation(&root(), AGENT_C, AGENT_B, &s(&["vault-read"]), Some(10), 1).unwrap_err();
        assert!(matches!(err, DelegateError::DelegatorNotPermitted(Denial::CallerNotListed)));
        let err = validate_delegation(&root(), OWNER_A, AGENT_B, &s(&["vault-read"]), Some(10), 1000).unwrap_err();
        assert!(matches!(err, DelegateError::DelegatorNotPermitted(Denial::Expired { .. })));
    }

    #[test]
    fn delegation_to_self_and_empty_delegation_are_refused() {
        assert_eq!(validate_delegation(&root(), OWNER_A, OWNER_A, &s(&["vault-read"]), Some(10), 1).unwrap_err(), DelegateError::SelfDelegation);
        assert_eq!(validate_delegation(&root(), OWNER_A, AGENT_B, &[], Some(10), 1).unwrap_err(), DelegateError::Empty);
    }

    #[test]
    fn a_legacy_policy_without_delegations_still_decodes() {
        let legacy = serde_json::json!({
            "allowed_callers": [OWNER_A], "allowed_functions": ["vault-read"],
            "valid_until_secs": 1000, "version": 3
        });
        let p: Policy = serde_json::from_value(legacy).unwrap();
        assert!(p.delegations.is_empty());
        assert!(evaluate(&p, OWNER_A, "vault-read", 1).is_ok());
    }
}
