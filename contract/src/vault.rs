//! The gated vault. `vault-read` refuses to serve a record unless the
//! node bound a calling user to the execution, and it records the
//! attempt whether or not the record is served.
//!
//! # Why a denial returns `Ok`
//!
//! The host rolls back everything a call wrote if that call returns
//! `Err`, an audit append included. Implementing a business denial as
//! an early `Err` therefore erases its own audit entry, leaving a trail
//! that records only successes. A local test harness has no rollback
//! concept, so that shape passes tests and still loses entries against
//! the real store.
//!
//! So an expected denial is a successful return carrying
//! `status: "denied"` and a reason. `Err` is reserved for genuine
//! infrastructure faults, which have nothing meaningful to record.

use serde::{Deserialize, Serialize};

/// `vault-put` input. Accepts only a record id and an opaque payload —
/// no caller-supplied identity, timestamp, or sequence number, so a
/// caller cannot forge the provenance fields of the audit trail.
#[derive(Debug, Deserialize)]
pub struct VaultPutReq {
    pub record_id: String,
    pub payload: String,
}

#[derive(Debug, Serialize)]
pub struct VaultPutResp {
    pub record_id: String,
    pub status: &'static str,
    /// Present only when `status` is `denied`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub written_at_secs: u64,
    pub seq_no: u64,
    pub audit_key: String,
}

/// `vault-read` input. `purpose` is recorded verbatim in the audit
/// entry and is never used to make an access decision.
#[derive(Debug, Deserialize)]
pub struct VaultReadReq {
    pub record_id: String,
    #[serde(default)]
    pub purpose: Option<String>,
}

/// Outcome of a read attempt. `served` carries the payload; `denied`
/// carries a reason and no payload. Both are successful returns, so
/// both keep their audit entry.
#[derive(Debug, Serialize)]
pub struct VaultReadResp {
    pub record_id: String,
    pub status: &'static str,
    /// Present only when `status` is `served`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    /// Present only when `status` is `denied`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Key of the audit entry this attempt produced. Written for a
    /// denial as well as a success.
    pub audit_key: String,
}

pub const STATUS_SERVED: &str = "served";
pub const STATUS_DENIED: &str = "denied";

/// Record ids become KV keys, so they are constrained rather than
/// trusted: no empty ids, no oversized ids, and no separator bytes
/// that could collide with another key's encoding.
pub fn validate_record_id(record_id: &str) -> Result<(), String> {
    if record_id.is_empty() {
        return Err("bad input: record_id must not be empty".to_string());
    }
    if record_id.len() > 128 {
        return Err("bad input: record_id must be at most 128 bytes".to_string());
    }
    if !record_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(
            "bad input: record_id may contain only ASCII alphanumerics, '-', '_' and '.'"
                .to_string(),
        );
    }
    Ok(())
}

pub fn vault_put(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: VaultPutReq =
        serde_json::from_slice(input).map_err(|e| format!("vault-put: bad input: {e}"))?;
    validate_record_id(&req.record_id).map_err(|e| format!("vault-put: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = vault_put_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("vault_put reaches the host and only runs on the wasm32 target".to_string())
    }
}

pub fn vault_read(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: VaultReadReq =
        serde_json::from_slice(input).map_err(|e| format!("vault-read: bad input: {e}"))?;
    validate_record_id(&req.record_id).map_err(|e| format!("vault-read: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = vault_read_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("vault_read reaches the host and only runs on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::{
    audit::{self, AuditEntry},
    host::{interfaces::kv_store, tenant::tenant_context},
    identity,
    policy::{self, Delegation, Policy},
};

/// Build an audit entry stamped with who called and on whose behalf.
///
/// The caller is whoever authenticated, read from the node-minted context
/// (`authenticated_did`). On a delegated call that is the agent. The
/// subject is whose data it is (`user_did`). Both are node-minted, neither
/// comes from the request, and the consent policy is evaluated against
/// the caller. Keying it on the subject instead was the bug that made an
/// agent's delegated read look like the owner's own.
#[cfg(target_arch = "wasm32")]
fn base_entry(
    action: &str,
    record_id: &str,
    purpose: Option<String>,
    context: Option<&[u8]>,
) -> Result<AuditEntry, String> {
    let ids = identity::resolve(context)?;
    Ok(AuditEntry {
        seq_no: tenant_context::seq_no(),
        at_secs: tenant_context::cluster_timestamp_secs(),
        contract_id: tenant_context::contract_id(),
        tenant_did: hex::encode(tenant_context::tenant_did()),
        caller_did: ids.caller,
        subject_did: ids.subject,
        action: action.to_string(),
        record_id: record_id.to_string(),
        purpose: purpose.unwrap_or_default(),
        outcome: STATUS_SERVED.to_string(),
        reason: String::new(),
    })
}

#[cfg(target_arch = "wasm32")]
fn vault_put_wasm(req: VaultPutReq, context: Option<&[u8]>) -> Result<VaultPutResp, String> {
    let mut entry = base_entry("vault-put", &req.record_id, None, context)?;

    // Same gate as the read. With the policy naming only vault-read,
    // this is where an unauthorised write is actually stopped, which the
    // delegation grant did not do.
    let gate = policy::load()?;
    if let Err(denial) = policy::evaluate(&gate, &entry.caller_did, "vault-put", entry.at_secs) {
        entry.outcome = STATUS_DENIED.to_string();
        entry.reason = denial.reason();
        let audit_key = audit::append(&entry)?;
        return Ok(VaultPutResp {
            record_id: req.record_id,
            status: STATUS_DENIED,
            reason: Some(entry.reason),
            written_at_secs: entry.at_secs,
            seq_no: entry.seq_no,
            audit_key,
        });
    }

    let map = crate::map_name(crate::VAULT_TAIL);
    kv_store::put(&map, req.record_id.as_bytes(), req.payload.as_bytes())
        .map_err(|e| format!("vault-put: write {map}: {e}"))?;

    let audit_key = audit::append(&entry)?;

    Ok(VaultPutResp {
        record_id: req.record_id,
        status: STATUS_SERVED,
        reason: None,
        written_at_secs: entry.at_secs,
        seq_no: entry.seq_no,
        audit_key,
    })
}

#[cfg(target_arch = "wasm32")]
fn vault_read_wasm(req: VaultReadReq, context: Option<&[u8]>) -> Result<VaultReadResp, String> {
    // Establish the principal BEFORE touching the record, so an
    // unattributable call never reads the data at all.
    let mut entry = base_entry("vault-read", &req.record_id, req.purpose, context)?;

    // The consent gate. This is the check the delegation grant does not
    // make for a contract with no egress, so the contract makes it.
    // Refuse before reading anything, and record the refusal.
    let gate = policy::load()?;
    if let Err(denial) = policy::evaluate(
        &gate,
        &entry.caller_did,
        "vault-read",
        entry.at_secs,
    ) {
        entry.outcome = STATUS_DENIED.to_string();
        entry.reason = denial.reason();
        let audit_key = audit::append(&entry)?;
        return Ok(VaultReadResp {
            record_id: req.record_id,
            status: STATUS_DENIED,
            payload: None,
            reason: Some(entry.reason),
            audit_key,
        });
    }

    let map = crate::map_name(crate::VAULT_TAIL);

    // A KV failure is an infrastructure fault, so it stays an `Err`.
    let found = kv_store::get(&map, req.record_id.as_bytes())
        .map_err(|e| format!("vault-read: read {map}: {e}"))?;

    let payload = match found {
        Some(bytes) => match String::from_utf8(bytes) {
            Ok(text) => Some(text),
            Err(_) => {
                // Stored data we cannot return is a denial, not a fault:
                // record the attempt rather than erasing it.
                entry.outcome = STATUS_DENIED.to_string();
                entry.reason = "stored record is not valid UTF-8".to_string();
                None
            }
        },
        None => {
            entry.outcome = STATUS_DENIED.to_string();
            entry.reason = "no such record".to_string();
            None
        }
    };

    // Same transaction as the read. A served payload cannot leave
    // without its entry, and a denial keeps its entry because this
    // function returns `Ok` either way.
    let audit_key = audit::append(&entry)?;

    Ok(match payload {
        Some(text) => VaultReadResp {
            record_id: req.record_id,
            status: STATUS_SERVED,
            payload: Some(text),
            reason: None,
            audit_key,
        },
        None => VaultReadResp {
            record_id: req.record_id,
            status: STATUS_DENIED,
            payload: None,
            reason: Some(entry.reason),
            audit_key,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_record_id() {
        assert!(validate_record_id("")
            .unwrap_err()
            .contains("must not be empty"));
    }

    #[test]
    fn rejects_separator_bytes_in_record_id() {
        for bad in ["a:b", "a/b", "a b", "a\u{0}b"] {
            assert!(
                validate_record_id(bad).is_err(),
                "should have rejected {bad:?}"
            );
        }
    }

    #[test]
    fn accepts_ordinary_record_ids() {
        for ok in ["medical-1", "record_2", "v1.2.3", "ABC123"] {
            assert!(validate_record_id(ok).is_ok(), "should have accepted {ok:?}");
        }
    }

    #[test]
    fn rejects_oversized_record_id() {
        let long = "a".repeat(129);
        assert!(validate_record_id(&long).unwrap_err().contains("128 bytes"));
    }

    #[test]
    fn read_rejects_non_json() {
        assert!(vault_read(b"not json", None).unwrap_err().contains("bad input"));
    }

    #[test]
    fn put_rejects_caller_supplied_provenance() {
        // seq_no / caller_did / at_secs are NOT accepted from the caller:
        // the struct has no such fields, and a payload missing the real
        // ones fails at parse time.
        let input = serde_json::to_vec(&serde_json::json!({
            "record_id": "medical-1",
            "seq_no": 1,
            "caller_did": "deadbeef",
        }))
        .unwrap();
        assert!(vault_put(&input, None).unwrap_err().contains("bad input"));
    }

    #[test]
    fn read_validates_id_before_reaching_host() {
        let input = serde_json::to_vec(&serde_json::json!({ "record_id": "a:b" })).unwrap();
        let err = vault_read(&input, None).unwrap_err();
        assert!(err.contains("record_id may contain only"), "got: {err}");
    }

    #[test]
    fn denied_response_carries_no_payload() {
        // The denial shape must never serialise a payload field, so a
        // consumer cannot mistake an absent payload for an empty one.
        let denied = VaultReadResp {
            record_id: "medical-1".to_string(),
            status: STATUS_DENIED,
            payload: None,
            reason: Some("no such record".to_string()),
            audit_key: "00000000000000000007".to_string(),
        };
        let json = serde_json::to_string(&denied).unwrap();
        assert!(!json.contains("payload"), "denial leaked a payload key: {json}");
        assert!(json.contains("\"status\":\"denied\""));
    }

    #[test]
    fn served_response_carries_no_reason() {
        let served = VaultReadResp {
            record_id: "medical-1".to_string(),
            status: STATUS_SERVED,
            payload: Some("data".to_string()),
            reason: None,
            audit_key: "00000000000000000008".to_string(),
        };
        let json = serde_json::to_string(&served).unwrap();
        assert!(!json.contains("reason"), "success carried a reason: {json}");
    }
}

// ---------------------------------------------------------------------
// Policy administration
// ---------------------------------------------------------------------

/// `policy-set` input. Absent `valid_until_secs` means no expiry.
#[derive(Debug, Deserialize)]
pub struct PolicySetReq {
    #[serde(default)]
    pub allowed_callers: Vec<String>,
    #[serde(default)]
    pub allowed_functions: Vec<String>,
    #[serde(default)]
    pub valid_until_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct PolicySetResp {
    pub version: u32,
    pub allowed_callers: Vec<String>,
    pub allowed_functions: Vec<String>,
    pub valid_until_secs: Option<u64>,
    pub audit_key: String,
}

#[derive(Debug, Serialize)]
pub struct PolicyGetResp {
    pub version: u32,
    pub allowed_callers: Vec<String>,
    pub allowed_functions: Vec<String>,
    pub valid_until_secs: Option<u64>,
    pub delegations: Vec<Delegation>,
    /// Cluster-pinned time the answer was computed against.
    pub now_secs: u64,
    pub expired: bool,
}

/// A caller may only be listed as 40 hex characters, the shape a DID
/// decodes to. Rejecting anything else keeps a typo from silently
/// producing a policy that matches nobody.
#[cfg(not(target_arch = "wasm32"))]
use crate::policy::Delegation;

pub fn validate_caller_hex(caller: &str) -> Result<(), String> {
    if caller.len() != 40 || !caller.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "bad input: caller \"{caller}\" must be 40 hex characters, the body of a did:t3n"
        ));
    }
    Ok(())
}

pub fn policy_set(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: PolicySetReq =
        serde_json::from_slice(input).map_err(|e| format!("policy-set: bad input: {e}"))?;
    for caller in &req.allowed_callers {
        validate_caller_hex(caller).map_err(|e| format!("policy-set: {e}"))?;
    }

    #[cfg(target_arch = "wasm32")]
    {
        let resp = policy_set_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("policy_set reaches the host and only runs on the wasm32 target".to_string())
    }
}

pub fn policy_get(context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let resp = policy_get_wasm(context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = context;
        Err("policy_get reaches the host and only runs on the wasm32 target".to_string())
    }
}

/// Only the tenant that owns this contract may read or change the policy.
///
/// Compared against the AUTHENTICATED identity, not the subject. An agent
/// acting on the tenant's behalf has the tenant as its subject, and if
/// this checked the subject, any agent with a platform grant naming
/// policy-set could rewrite consent for the owner. Both values are minted
/// by the node; neither comes from the request.
#[cfg(target_arch = "wasm32")]
fn require_tenant(action: &str, context: Option<&[u8]>) -> Result<String, String> {
    let ids = identity::resolve(context)?;
    let tenant = hex::encode(tenant_context::tenant_did());
    if !ids.caller.eq_ignore_ascii_case(&tenant) {
        return Err(format!(
            "{action}: only the tenant that owns this contract may do this"
        ));
    }
    Ok(ids.caller)
}

#[cfg(target_arch = "wasm32")]
fn policy_set_wasm(req: PolicySetReq, context: Option<&[u8]>) -> Result<PolicySetResp, String> {
    require_tenant("policy-set", context)?;

    let existing = policy::load()?;
    let next = Policy {
        allowed_callers: req.allowed_callers,
        allowed_functions: req.allowed_functions,
        valid_until_secs: req.valid_until_secs,
        // A rewrite of the root clears every chain beneath it. Whatever
        // was handed on was handed on under the previous consent.
        delegations: Vec::new(),
        // Monotonic, so a reader can tell a fresh document from a stale
        // one, and so version 0 keeps meaning "nothing in force".
        version: existing.version.saturating_add(1),
    };
    policy::store(&next)?;

    // Recorded in the same trail as the accesses, so widening permission
    // is as visible as using it.
    let mut entry = base_entry("policy-set", "consent", None, context)?;
    entry.reason = alloc::format!(
        "version {} -> {}, {} caller(s), {} function(s), expiry {}",
        existing.version,
        next.version,
        next.allowed_callers.len(),
        next.allowed_functions.len(),
        next.valid_until_secs
            .map(|v| v.to_string())
            .unwrap_or_else(|| "none".to_string())
    );
    let audit_key = audit::append(&entry)?;

    Ok(PolicySetResp {
        version: next.version,
        allowed_callers: next.allowed_callers,
        allowed_functions: next.allowed_functions,
        valid_until_secs: next.valid_until_secs,
        audit_key,
    })
}

#[cfg(target_arch = "wasm32")]
fn policy_get_wasm(context: Option<&[u8]>) -> Result<PolicyGetResp, String> {
    require_tenant("policy-get", context)?;

    let current = policy::load()?;
    let now_secs = tenant_context::cluster_timestamp_secs();
    let expired = current
        .valid_until_secs
        .map(|until| now_secs >= until)
        .unwrap_or(false);

    Ok(PolicyGetResp {
        version: current.version,
        allowed_callers: current.allowed_callers,
        allowed_functions: current.allowed_functions,
        valid_until_secs: current.valid_until_secs,
        delegations: current.delegations,
        now_secs,
        expired,
    })
}

#[cfg(test)]
mod policy_admin_tests {
    use super::*;

    #[test]
    fn rejects_a_caller_that_is_not_forty_hex_characters() {
        // A typo here would otherwise produce a policy matching nobody.
        assert!(validate_caller_hex("abe8e6dc").is_err());
        assert!(validate_caller_hex("did:t3n:abe8e6dc8a4335ae0c2a97750185f3b25e880dba").is_err());
        assert!(validate_caller_hex(&"z".repeat(40)).is_err());
    }

    #[test]
    fn accepts_the_body_of_a_did() {
        assert!(validate_caller_hex("abe8e6dc8a4335ae0c2a97750185f3b25e880dba").is_ok());
    }

    #[test]
    fn policy_set_rejects_a_bad_caller_before_reaching_the_host() {
        let input = serde_json::to_vec(&serde_json::json!({
            "allowed_callers": ["not-a-did"],
            "allowed_functions": ["vault-read"],
        }))
        .unwrap();
        let err = policy_set(&input, None).unwrap_err();
        assert!(err.contains("40 hex characters"), "got: {err}");
    }

    #[test]
    fn policy_set_rejects_non_json() {
        assert!(policy_set(b"not json", None).unwrap_err().contains("bad input"));
    }
}

// ---------------------------------------------------------------------
// Delegation: handing part of one's own permission to another identity
// ---------------------------------------------------------------------

/// `policy-delegate` input. The delegator is never in the input: it is
/// the calling identity, minted by the node, so nobody can delegate on
/// someone else's behalf.
#[derive(Debug, Deserialize)]
pub struct PolicyDelegateReq {
    /// Hex body of the delegatee's DID.
    pub to: String,
    pub functions: Vec<String>,
    #[serde(default)]
    pub valid_until_secs: Option<u64>,
}

/// Outcome of a handoff. A refused handoff is a successful response
/// carrying `denied`, for the same reason a refused read is: the host
/// rolls back a failed call's writes, and a refused widening attempt is
/// exactly the kind of thing the trail must keep.
#[derive(Debug, Serialize)]
pub struct PolicyDelegateResp {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub version: u32,
    pub from: String,
    pub to: String,
    pub functions: Vec<String>,
    pub valid_until_secs: Option<u64>,
    /// Depth the delegatee will sit at: 1 below a root caller.
    pub depth: u32,
    pub audit_key: String,
}

pub fn policy_delegate(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: PolicyDelegateReq =
        serde_json::from_slice(input).map_err(|e| format!("policy-delegate: bad input: {e}"))?;
    validate_caller_hex(&req.to).map_err(|e| format!("policy-delegate: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = policy_delegate_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("policy_delegate reaches the host and only runs on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn policy_delegate_wasm(req: PolicyDelegateReq, context: Option<&[u8]>) -> Result<PolicyDelegateResp, String> {
    // The delegator is whoever the node says authenticated. Not the tenant
    // check: any currently permitted caller may hand on a subset.
    let mut entry = base_entry("policy-delegate", "consent", None, context)?;
    let from = entry.caller_did.clone();
    let now = entry.at_secs;

    let mut current = policy::load()?;

    match policy::validate_delegation(&current, &from, &req.to, &req.functions, req.valid_until_secs, now) {
        Err(refusal) => {
            // Refused inside the enclave, and recorded: an attempt to widen
            // is worth more in the trail than a successful narrowing.
            entry.outcome = STATUS_DENIED.to_string();
            entry.reason = refusal.reason();
            let audit_key = audit::append(&entry)?;
            Ok(PolicyDelegateResp {
                status: STATUS_DENIED,
                reason: Some(entry.reason),
                version: current.version,
                from,
                to: req.to,
                functions: req.functions,
                valid_until_secs: req.valid_until_secs,
                depth: 0,
                audit_key,
            })
        }
        Ok(held) => {
            // Replace any earlier handoff from this delegator to this
            // delegatee, so re-delegating narrows rather than accumulates.
            current
                .delegations
                .retain(|d| !(d.from.eq_ignore_ascii_case(&from) && d.to.eq_ignore_ascii_case(&req.to)));
            current.delegations.push(Delegation {
                from: from.clone(),
                to: req.to.clone(),
                functions: req.functions.clone(),
                valid_until_secs: req.valid_until_secs,
            });
            current.version = current.version.saturating_add(1);
            policy::store(&current)?;

            entry.reason = alloc::format!(
                "version {} : {} -> {} handed [{}] until {}, depth {}",
                current.version,
                &from[..8],
                &req.to[..8],
                req.functions.join(","),
                req.valid_until_secs.map(|v| v.to_string()).unwrap_or_else(|| "none".to_string()),
                held.depth + 1
            );
            let audit_key = audit::append(&entry)?;

            Ok(PolicyDelegateResp {
                status: STATUS_SERVED,
                reason: None,
                version: current.version,
                from,
                to: req.to,
                functions: req.functions,
                valid_until_secs: req.valid_until_secs,
                depth: held.depth + 1,
                audit_key,
            })
        }
    }
}

#[cfg(test)]
mod delegate_input_tests {
    use super::*;

    #[test]
    fn rejects_a_malformed_delegatee_before_reaching_the_host() {
        let input = serde_json::to_vec(&serde_json::json!({ "to": "not-a-did", "functions": ["vault-read"] })).unwrap();
        assert!(policy_delegate(&input, None).unwrap_err().contains("40 hex characters"));
    }

    #[test]
    fn rejects_non_json() {
        assert!(policy_delegate(b"nope", None).unwrap_err().contains("bad input"));
    }

    #[test]
    fn the_delegator_is_not_accepted_from_the_input() {
        // No `from` field exists on the request, so a payload naming one
        // is simply not the shape the contract reads. The identity comes
        // from the node.
        let input = serde_json::to_vec(&serde_json::json!({
            "from": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "to": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "functions": ["vault-read"]
        })).unwrap();
        // Parses (unknown fields are ignored) and proceeds to the host
        // path, which on the native target reports it cannot run.
        let err = policy_delegate(&input, None).unwrap_err();
        assert!(err.contains("only runs on the wasm32 target"));
    }
}


// ---------------------------------------------------------------------
// Diagnostic: who does the node say is calling?
// ---------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct WhoamiResp {
    pub tenant_did: String,
    pub calling_user_did: Option<String>,
    /// Who authenticated, resolved from the context: the agent on a
    /// delegated call.
    pub caller_did: Option<String>,
    /// Whose data it is.
    pub subject_did: Option<String>,
    pub delegated: bool,
    /// The node-minted context, as UTF-8 if it is text, verbatim.
    pub context_utf8: Option<String>,
    pub context_len: usize,
}

pub fn whoami(context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let ids = identity::resolve(context).ok();
        let resp = WhoamiResp {
            tenant_did: hex::encode(tenant_context::tenant_did()),
            calling_user_did: tenant_context::calling_user_did().map(|d| hex::encode(&d)),
            caller_did: ids.as_ref().map(|i| i.caller.clone()),
            subject_did: ids.as_ref().map(|i| i.subject.clone()),
            delegated: ids.as_ref().map(|i| i.is_delegated()).unwrap_or(false),
            context_utf8: context.map(|c| String::from_utf8_lossy(c).into_owned()),
            context_len: context.map(|c| c.len()).unwrap_or(0),
        };
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = context;
        Err("whoami reaches the host and only runs on the wasm32 target".to_string())
    }
}
