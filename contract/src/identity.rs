//! Who is calling, and on whose behalf.
//!
//! The host exposes two different answers and they diverge on exactly
//! the calls that matter.
//!
//! `tenant-context.calling-user-did()` is the SUBJECT: the identity whose
//! data is being accessed. On a self-call that is the caller. On a
//! delegated call it is the data owner, not the agent doing the calling.
//! A policy keyed on it cannot tell agents apart. Verified on testnet:
//! an agent's delegated read was recorded against the owner's DID.
//!
//! The node-minted context bytes carry both. `user_did` is the subject as
//! raw bytes; `authenticated_did` is whoever actually authenticated, as a
//! `did:t3n:` string. On a delegated call that is the agent. This module
//! reads the context first and falls back to tenant-context only when no
//! context was supplied.
//!
//! Neither value comes from the request body. Both are minted by the
//! node, so the caller cannot claim to be someone else on either axis.

use serde::Deserialize;

/// The identities a call carries, as 40-character hex bodies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identities {
    /// Whoever authenticated: the agent on a delegated call, the owner on
    /// a self-call. This is the identity consent is evaluated against.
    pub caller: String,
    /// Whose data it is. Equal to `caller` on a self-call.
    pub subject: String,
}

impl Identities {
    pub fn is_delegated(&self) -> bool {
        !self.caller.eq_ignore_ascii_case(&self.subject)
    }
}

#[derive(Debug, Deserialize)]
struct DynamicContext {
    #[serde(default)]
    user_did: Option<Vec<u8>>,
    #[serde(default)]
    authenticated_did: Option<String>,
}

/// Strip a `did:t3n:` prefix, leaving the hex body.
pub fn did_body(did: &str) -> &str {
    did.strip_prefix("did:t3n:").unwrap_or(did)
}

/// Parse the node-minted context. Returns `None` if either identity is
/// missing or malformed, so the caller can fall back rather than guess.
pub fn from_context(context: &[u8]) -> Option<Identities> {
    let ctx: DynamicContext = serde_json::from_slice(context).ok()?;
    let subject_bytes = ctx.user_did?;
    if subject_bytes.len() != 20 {
        return None;
    }
    let authed = ctx.authenticated_did?;
    let caller = did_body(&authed);
    if caller.len() != 40 || !caller.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(Identities {
        caller: caller.to_ascii_lowercase(),
        subject: hex::encode(subject_bytes),
    })
}

/// Resolve identities for this call: the context when present and
/// well-formed, otherwise tenant-context, which on a self-call is correct
/// and on a delegated call at least names the subject.
#[cfg(target_arch = "wasm32")]
pub fn resolve(context: Option<&[u8]>) -> Result<Identities, String> {
    use crate::host::tenant::tenant_context;

    if let Some(ids) = context.and_then(from_context) {
        return Ok(ids);
    }
    match tenant_context::calling_user_did() {
        Some(did) => {
            let hex = hex::encode(&did);
            Ok(Identities {
                caller: hex.clone(),
                subject: hex,
            })
        }
        None => Err(
            "no calling user bound to this execution: invoke through an authenticated \
             session, not a direct dev-exec or webhook dispatch"
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CTX: &str = r#"{"user_did":[106,129,1,175,249,188,240,168,88,3,216,5,37,110,146,170,176,176,109,7],"is_mock_mode":false,"authenticators":null,"cluster_timestamp_secs":1788806778,"authenticated_did":"did:t3n:24878B03891B3D4D2A46276FA48C8382FC262A34"}"#;

    #[test]
    fn reads_both_identities_from_a_real_delegated_context() {
        // Captured from testnet: agent A calling on the tenant's behalf.
        let ids = from_context(CTX.as_bytes()).unwrap();
        assert_eq!(ids.subject, "6a8101aff9bcf0a85803d805256e92aab0b06d07");
        assert_eq!(ids.caller, "24878b03891b3d4d2a46276fa48c8382fc262a34");
        assert!(ids.is_delegated());
    }

    #[test]
    fn a_self_call_has_caller_equal_to_subject() {
        let ctx = r#"{"user_did":[106,129,1,175,249,188,240,168,88,3,216,5,37,110,146,170,176,176,109,7],"authenticated_did":"did:t3n:6a8101aff9bcf0a85803d805256e92aab0b06d07"}"#;
        let ids = from_context(ctx.as_bytes()).unwrap();
        assert!(!ids.is_delegated());
        assert_eq!(ids.caller, ids.subject);
    }

    #[test]
    fn caller_hex_is_normalised_to_lowercase() {
        // The captured context spells the DID in upper case; policy
        // comparisons are case-insensitive but storage should be stable.
        let ids = from_context(CTX.as_bytes()).unwrap();
        assert_eq!(ids.caller, ids.caller.to_ascii_lowercase());
    }

    #[test]
    fn malformed_context_yields_none_rather_than_a_guess() {
        assert!(from_context(b"not json").is_none());
        assert!(from_context(br#"{"user_did":[1,2,3],"authenticated_did":"did:t3n:abc"}"#).is_none());
        assert!(from_context(br#"{"authenticated_did":"did:t3n:24878b03891b3d4d2a46276fa48c8382fc262a34"}"#).is_none());
        assert!(from_context(br#"{"user_did":[106,129,1,175,249,188,240,168,88,3,216,5,37,110,146,170,176,176,109,7]}"#).is_none());
    }

    #[test]
    fn did_body_strips_only_the_prefix() {
        assert_eq!(did_body("did:t3n:abc"), "abc");
        assert_eq!(did_body("abc"), "abc");
    }
}
