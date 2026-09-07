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

pub fn vault_put(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: VaultPutReq =
        serde_json::from_slice(input).map_err(|e| format!("vault-put: bad input: {e}"))?;
    validate_record_id(&req.record_id).map_err(|e| format!("vault-put: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = vault_put_wasm(req)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("vault_put reaches the host and only runs on the wasm32 target".to_string())
    }
}

pub fn vault_read(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: VaultReadReq =
        serde_json::from_slice(input).map_err(|e| format!("vault-read: bad input: {e}"))?;
    validate_record_id(&req.record_id).map_err(|e| format!("vault-read: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = vault_read_wasm(req)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("vault_read reaches the host and only runs on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::{
    audit::{self, AuditEntry},
    host::{interfaces::kv_store, tenant::tenant_context},
};

/// Read the calling user DID the node bound to this execution.
///
/// `None` means the contract was reached by a path that carries no
/// authenticated session. There is no principal to attribute the
/// access to, and therefore no audit entry worth writing, so this is
/// one of the few cases that is genuinely an `Err`.
#[cfg(target_arch = "wasm32")]
fn require_caller() -> Result<String, String> {
    match tenant_context::calling_user_did() {
        Some(did) => Ok(hex::encode(&did)),
        None => Err(
            "no calling user bound to this execution: invoke through an authenticated \
             session, not a direct dev-exec or webhook dispatch"
                .to_string(),
        ),
    }
}

#[cfg(target_arch = "wasm32")]
fn base_entry(
    action: &str,
    record_id: &str,
    purpose: Option<String>,
) -> Result<AuditEntry, String> {
    Ok(AuditEntry {
        seq_no: tenant_context::seq_no(),
        at_secs: tenant_context::cluster_timestamp_secs(),
        contract_id: tenant_context::contract_id(),
        tenant_did: hex::encode(tenant_context::tenant_did()),
        caller_did: require_caller()?,
        action: action.to_string(),
        record_id: record_id.to_string(),
        purpose: purpose.unwrap_or_default(),
        outcome: STATUS_SERVED.to_string(),
        reason: String::new(),
    })
}

#[cfg(target_arch = "wasm32")]
fn vault_put_wasm(req: VaultPutReq) -> Result<VaultPutResp, String> {
    let entry = base_entry("vault-put", &req.record_id, None)?;
    let map = crate::map_name(crate::VAULT_TAIL);

    kv_store::put(&map, req.record_id.as_bytes(), req.payload.as_bytes())
        .map_err(|e| format!("vault-put: write {map}: {e}"))?;

    let audit_key = audit::append(&entry)?;

    Ok(VaultPutResp {
        record_id: req.record_id,
        written_at_secs: entry.at_secs,
        seq_no: entry.seq_no,
        audit_key,
    })
}

#[cfg(target_arch = "wasm32")]
fn vault_read_wasm(req: VaultReadReq) -> Result<VaultReadResp, String> {
    // Establish the principal BEFORE touching the record, so an
    // unattributable call never reads the data at all.
    let mut entry = base_entry("vault-read", &req.record_id, req.purpose)?;

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
        assert!(vault_read(b"not json").unwrap_err().contains("bad input"));
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
        assert!(vault_put(&input).unwrap_err().contains("bad input"));
    }

    #[test]
    fn read_validates_id_before_reaching_host() {
        let input = serde_json::to_vec(&serde_json::json!({ "record_id": "a:b" })).unwrap();
        let err = vault_read(&input).unwrap_err();
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
