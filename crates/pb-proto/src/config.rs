//! Signed configuration delivery.
//!
//! The game database, route matrix and campaign feed all change constantly and must
//! reach clients without an app release. They travel over a CDN, so the client verifies
//! an ed25519 signature against a pinned public key *independently of TLS*.
//!
//! That independence is the whole point. TLS authenticates the CDN; it does nothing about
//! a compromised CDN account or a mis-issued certificate. Since this config decides
//! **where user traffic is sent**, accepting unsigned config would be a traffic
//! interception vulnerability, not a robustness nicety.
//!
//! This module holds the acceptance rules. Signature verification itself lives with the
//! crypto dependency in `pb-tunnel`; the rules here are what stop a *validly signed but
//! stale or replayed* config from being accepted, which signatures alone cannot do.

/// Which dataset a manifest describes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConfigKind {
    /// Supported games: executables, server address ranges, per-game routing policy.
    GameDatabase,
    /// Current best-path table from the measurement pipeline.
    RouteMatrix,
    /// PoP list with health and geography.
    NodeDirectory,
    /// Third-party Drops campaigns, for the in-app tracker.
    Campaigns,
}

/// Metadata accompanying a signed config blob.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfigManifest {
    /// Which dataset this is.
    pub kind: ConfigKind,
    /// Strictly increasing publish counter.
    pub version: u64,
    /// Unix seconds after which this config must not be used.
    pub expires_at: i64,
}

/// Why a config blob was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigRejection {
    /// Offered version is not newer than what we already hold.
    ///
    /// Without this check, an attacker who can serve us any *previously valid* signed
    /// blob can roll us back to an older route matrix indefinitely. The signature on
    /// that old blob is perfectly good, which is exactly why signatures are not enough.
    NotNewer {
        /// Version we already hold.
        have: u64,
        /// Version offered.
        offered: u64,
    },
    /// Config is past its expiry.
    ///
    /// Bounds how long a withheld-update attack can freeze us on stale routing.
    Expired {
        /// When it expired.
        expired_at: i64,
        /// Current time.
        now: i64,
    },
    /// Manifest describes a different dataset than the one being replaced.
    KindMismatch {
        /// Dataset expected.
        expected: ConfigKind,
        /// Dataset offered.
        offered: ConfigKind,
    },
}

/// Decides whether to accept an incoming config blob.
///
/// `have` is the version currently held, or `None` on a first install. Signature
/// verification is the caller's responsibility and must happen *before* this call —
/// these rules assume the blob is authentic and ask only whether it is *current*.
pub fn accept(
    expected: ConfigKind,
    have: Option<u64>,
    offered: &ConfigManifest,
    now: i64,
) -> Result<(), ConfigRejection> {
    if offered.kind != expected {
        return Err(ConfigRejection::KindMismatch {
            expected,
            offered: offered.kind,
        });
    }
    if offered.expires_at <= now {
        return Err(ConfigRejection::Expired {
            expired_at: offered.expires_at,
            now,
        });
    }
    if let Some(have) = have {
        if offered.version <= have {
            return Err(ConfigRejection::NotNewer {
                have,
                offered: offered.version,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    fn manifest(kind: ConfigKind, version: u64, expires_at: i64) -> ConfigManifest {
        ConfigManifest {
            kind,
            version,
            expires_at,
        }
    }

    #[test]
    fn fresh_install_accepts_any_current_version() {
        let m = manifest(ConfigKind::RouteMatrix, 42, NOW + 3600);
        assert_eq!(accept(ConfigKind::RouteMatrix, None, &m, NOW), Ok(()));
    }

    #[test]
    fn newer_version_accepted() {
        let m = manifest(ConfigKind::RouteMatrix, 43, NOW + 3600);
        assert_eq!(accept(ConfigKind::RouteMatrix, Some(42), &m, NOW), Ok(()));
    }

    #[test]
    fn rollback_rejected() {
        let m = manifest(ConfigKind::RouteMatrix, 41, NOW + 3600);
        assert_eq!(
            accept(ConfigKind::RouteMatrix, Some(42), &m, NOW),
            Err(ConfigRejection::NotNewer {
                have: 42,
                offered: 41
            })
        );
    }

    #[test]
    fn replay_of_current_version_rejected() {
        let m = manifest(ConfigKind::RouteMatrix, 42, NOW + 3600);
        assert!(matches!(
            accept(ConfigKind::RouteMatrix, Some(42), &m, NOW),
            Err(ConfigRejection::NotNewer { .. })
        ));
    }

    #[test]
    fn expired_config_rejected_even_when_newer() {
        let m = manifest(ConfigKind::RouteMatrix, 99, NOW - 1);
        assert_eq!(
            accept(ConfigKind::RouteMatrix, Some(42), &m, NOW),
            Err(ConfigRejection::Expired {
                expired_at: NOW - 1,
                now: NOW
            })
        );
    }

    #[test]
    fn expiry_boundary_is_exclusive() {
        let m = manifest(ConfigKind::RouteMatrix, 99, NOW);
        assert!(matches!(
            accept(ConfigKind::RouteMatrix, None, &m, NOW),
            Err(ConfigRejection::Expired { .. })
        ));
    }

    #[test]
    fn a_game_database_cannot_be_installed_as_a_route_matrix() {
        // Both are signed by the same key, so only the kind check separates them.
        // Without it, a valid game database blob could displace the route matrix.
        let m = manifest(ConfigKind::GameDatabase, 100, NOW + 3600);
        assert_eq!(
            accept(ConfigKind::RouteMatrix, Some(42), &m, NOW),
            Err(ConfigRejection::KindMismatch {
                expected: ConfigKind::RouteMatrix,
                offered: ConfigKind::GameDatabase,
            })
        );
    }
}
