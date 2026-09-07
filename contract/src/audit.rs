//! Audit trail. Every vault access attempt appends one entry, in the
//! same transaction as the attempt, so an access that is not recorded
//! cannot commit.
//!
//! Denials are recorded too. That only works because the vault returns
//! `Ok` for an expected denial: the host rolls back a failed call's
//! writes, so a denial implemented as `Err` would erase its own entry.

use serde::{Deserialize, Serialize};

/// One recorded access attempt. Written to `z:<tid>:audit` keyed by a
/// zero-padded sequence number so a lexicographic range scan returns
/// entries in chronological order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Store sequence number of the transaction that performed the attempt.
    pub seq_no: u64,
    /// Cluster-pinned timestamp, not wall-clock. Consistent across replicas.
    pub at_secs: u64,
    /// Interned id of the contract that ran.
    pub contract_id: u32,
    /// Hex of the tenant DID that owns the data.
    pub tenant_did: String,
    /// Hex of the calling user DID the node bound to the execution.
    pub caller_did: String,
    /// WIT function name that ran.
    pub action: String,
    /// Vault record touched.
    pub record_id: String,
    /// Caller-declared reason, recorded verbatim and never trusted.
    pub purpose: String,
    /// Whether the attempt was served or denied.
    #[serde(default)]
    pub outcome: String,
    /// Why it was denied. Empty when served.
    #[serde(default)]
    pub reason: String,
}

/// Audit keys are fixed-width zero-padded decimal so that byte order
/// equals numeric order. `kv-store::scan` is a lexicographic range
/// scan, so a bare `seq.to_string()` would sort 10 before 9.
pub fn audit_key(seq_no: u64) -> String {
    format!("{seq_no:020}")
}

#[derive(Debug, Deserialize)]
pub struct AuditListReq {
    /// Maximum entries to return. Clamped to 1..=1000; a scan `limit`
    /// of 0 is rejected by the host.
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct AuditListResp {
    pub entries: Vec<AuditEntry>,
    pub count: usize,
    /// Stored entries found but not decodable. Zero in normal
    /// operation. A non-zero value means something wrote a malformed
    /// entry, which is worth investigating even though it no longer
    /// breaks reading the rest of the trail.
    pub malformed_entries: u32,
}

/// Clamp a caller-supplied limit into the range the host accepts.
pub fn clamp_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(100).clamp(1, 1000)
}

pub fn audit_list(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: AuditListReq =
        serde_json::from_slice(input).map_err(|e| format!("audit-list: bad input: {e}"))?;
    let limit = clamp_limit(req.limit);

    #[cfg(target_arch = "wasm32")]
    {
        let resp = audit_list_wasm(limit)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = limit;
        Err("audit_list reaches the host and only runs on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::interfaces::{kv_store, logging};

#[cfg(target_arch = "wasm32")]
fn audit_list_wasm(limit: u32) -> Result<AuditListResp, String> {
    let map = crate::map_name(crate::AUDIT_TAIL);

    // Half-open [start, end). Keys are ASCII digits, so a single 0xff
    // byte sorts above every key and makes the range cover the map.
    let rows = kv_store::scan(&map, b"", &[0xff], limit)
        .map_err(|e| format!("audit-list: scan {map}: {e}"))?;

    // Accumulate rather than collecting into one Result. Nothing deletes
    // audit entries, so a single all-or-nothing decode would make one bad
    // row break every future read of the trail, permanently.
    let mut entries = Vec::with_capacity(rows.len());
    let mut malformed_entries = 0u32;
    for (key, value) in rows {
        match serde_json::from_slice::<AuditEntry>(&value) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                malformed_entries = malformed_entries.saturating_add(1);
                let _ = logging::error(&format!(
                    "audit-list: skipping malformed entry at {}: {e}",
                    String::from_utf8_lossy(&key)
                ));
            }
        }
    }

    let count = entries.len();
    Ok(AuditListResp {
        entries,
        count,
        malformed_entries,
    })
}

/// Append one audit entry. Called inside the same transaction as the
/// attempt it records.
#[cfg(target_arch = "wasm32")]
pub fn append(entry: &AuditEntry) -> Result<String, String> {
    let map = crate::map_name(crate::AUDIT_TAIL);
    let key = audit_key(entry.seq_no);
    let value = serde_json::to_vec(entry).map_err(|e| e.to_string())?;
    kv_store::put(&map, key.as_bytes(), &value)
        .map_err(|e| format!("audit append to {map}: {e}"))?;
    let _ = logging::info(&format!(
        "audit {} action={} record={} outcome={}",
        key, entry.action, entry.record_id, entry.outcome
    ));
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audit_keys_sort_numerically() {
        let mut keys = vec![audit_key(10), audit_key(9), audit_key(100)];
        keys.sort();
        assert_eq!(keys, vec![audit_key(9), audit_key(10), audit_key(100)]);
    }

    #[test]
    fn limit_is_clamped_away_from_zero() {
        // The host rejects a scan limit of 0, so it must never reach it.
        assert_eq!(clamp_limit(Some(0)), 1);
        assert_eq!(clamp_limit(None), 100);
        assert_eq!(clamp_limit(Some(50_000)), 1000);
    }

    #[test]
    fn audit_list_rejects_non_json() {
        let err = audit_list(b"not json").unwrap_err();
        assert!(err.contains("bad input"), "got: {err}");
    }

    #[test]
    fn entry_decodes_without_outcome_fields() {
        // Entries written before `outcome` / `reason` existed must still
        // decode, or one old row would count as malformed forever.
        let legacy = serde_json::json!({
            "seq_no": 1, "at_secs": 2, "contract_id": 3,
            "tenant_did": "aa", "caller_did": "bb",
            "action": "vault-read", "record_id": "medical-1", "purpose": "",
        });
        let entry: AuditEntry = serde_json::from_value(legacy).unwrap();
        assert_eq!(entry.outcome, "");
        assert_eq!(entry.reason, "");
    }
}
