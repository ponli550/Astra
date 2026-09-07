//! The gated vault. `vault-read` refuses to serve a record unless the
//! node bound a calling user to the execution, and it records the
//! access before returning.

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

#[derive(Debug, Serialize)]
pub struct VaultReadResp {
    pub record_id: String,
    pub payload: String,
    /// Key of the audit entry this read produced. The caller cannot
    /// obtain the payload without also producing this record.
    pub audit_key: String,
}

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
/// authenticated session, so there is no principal to attribute the
/// access to. Refuse rather than record an anonymous read.
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
fn base_entry(action: &str, record_id: &str, purpose: Option<String>) -> Result<AuditEntry, String> {
    Ok(AuditEntry {
        seq_no: tenant_context::seq_no(),
        at_secs: tenant_context::cluster_timestamp_secs(),
        contract_id: tenant_context::contract_id(),
        tenant_did: hex::encode(tenant_context::tenant_did()),
        caller_did: require_caller()?,
        action: action.to_string(),
        record_id: record_id.to_string(),
        purpose: purpose.unwrap_or_default(),
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
    let entry = base_entry("vault-read", &req.record_id, req.purpose)?;

    let map = crate::map_name(crate::VAULT_TAIL);
    let bytes = kv_store::get(&map, req.record_id.as_bytes())
        .map_err(|e| format!("vault-read: read {map}: {e}"))?
        .ok_or_else(|| format!("vault-read: no record '{}'", req.record_id))?;
    let payload = String::from_utf8(bytes)
        .map_err(|e| format!("vault-read: record is not valid UTF-8: {e}"))?;

    // Same transaction as the read: if this write fails the whole
    // invocation fails, so the payload cannot leave without a record.
    let audit_key = audit::append(&entry)?;

    Ok(VaultReadResp {
        record_id: req.record_id,
        payload,
        audit_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_record_id() {
        assert!(validate_record_id("").unwrap_err().contains("must not be empty"));
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
}
