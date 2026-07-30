//! Candidate paths and their measured quality.

use crate::ids::{PathId, PopId};

/// The shape of a candidate route from client to game server.
///
/// `Direct` is a first-class variant rather than a special case, because the direct
/// path competes on merit against every overlay path and frequently wins. See the
/// honesty principle in `docs/architecture/00-overview.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PathKind {
    /// No overlay. Traffic follows whatever route the ISP chooses.
    Direct,
    /// Client to ingress PoP, then straight out to the game server from the egress PoP.
    ///
    /// `ingress == egress` is the common single-PoP case.
    Relay {
        /// PoP the client tunnels to.
        ingress: PopId,
        /// PoP that talks to the game server. Its address is what the game server sees.
        egress: PopId,
    },
    /// Client to ingress, across our own backbone via a transit PoP, then out.
    ///
    /// This is the case that beats competitors: when the PoP nearest the player has a
    /// poor onward path, an intermediate hop can beat both direct and single-PoP relay.
    Chained {
        /// PoP the client tunnels to.
        ingress: PopId,
        /// Intermediate PoP.
        transit: PopId,
        /// PoP that talks to the game server.
        egress: PopId,
    },
}

impl PathKind {
    /// The PoP whose address the game server sees, if any.
    ///
    /// This is the value that must not change for the lifetime of a session. `None`
    /// means the player's own address is used, i.e. the direct path.
    pub const fn egress(&self) -> Option<PopId> {
        match self {
            PathKind::Direct => None,
            PathKind::Relay { egress, .. } | PathKind::Chained { egress, .. } => Some(*egress),
        }
    }

    /// The PoP the client tunnels into, if any.
    ///
    /// Unlike [`PathKind::egress`], this may change mid-session: the game server never
    /// sees it, so changing it is invisible to gameplay.
    pub const fn ingress(&self) -> Option<PopId> {
        match self {
            PathKind::Direct => None,
            PathKind::Relay { ingress, .. } | PathKind::Chained { ingress, .. } => Some(*ingress),
        }
    }

    /// How many of our PoPs the traffic traverses.
    ///
    /// Used to penalise complexity during scoring: every extra hop is another failure
    /// domain and another queue, so a path must earn its hops.
    pub const fn overlay_hops(&self) -> u8 {
        match self {
            PathKind::Direct => 0,
            PathKind::Relay { ingress, egress } => {
                if ingress.get() == egress.get() {
                    1
                } else {
                    2
                }
            }
            PathKind::Chained { .. } => 3,
        }
    }

    /// Whether this is the unaccelerated path.
    pub const fn is_direct(&self) -> bool {
        matches!(self, PathKind::Direct)
    }
}

/// Measured quality of one path over a recent window.
///
/// Latencies are milliseconds. `loss` is a fraction in `0.0..=1.0`, not a percentage —
/// mixing those two conventions is a classic source of scoring bugs that are off by
/// exactly 100x, so the unit is stated in the field name's documentation and enforced
/// by the constructor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PathStats {
    /// Median round-trip time, milliseconds.
    pub rtt_p50_ms: f64,
    /// 95th-percentile round-trip time, milliseconds. This is what players feel.
    pub rtt_p95_ms: f64,
    /// Variation in round-trip time, milliseconds.
    pub jitter_ms: f64,
    /// Fraction of probes lost, `0.0..=1.0`.
    pub loss: f64,
    /// How many probes this summary is built from. Low counts are not trustworthy.
    pub samples: u32,
}

impl PathStats {
    /// Builds a stats summary, clamping values into their valid ranges.
    ///
    /// Clamping rather than erroring is deliberate: these come from live measurement,
    /// and a single absurd sample should degrade a score, not take down the selector.
    pub fn new(rtt_p50_ms: f64, rtt_p95_ms: f64, jitter_ms: f64, loss: f64, samples: u32) -> Self {
        Self {
            rtt_p50_ms: rtt_p50_ms.max(0.0),
            // p95 cannot be below p50; if measurement says otherwise, trust the larger.
            rtt_p95_ms: rtt_p95_ms.max(rtt_p50_ms).max(0.0),
            jitter_ms: jitter_ms.max(0.0),
            loss: loss.clamp(0.0, 1.0),
            samples,
        }
    }

    /// Loss expressed as a percentage, for display only. Never use in scoring.
    pub fn loss_pct(&self) -> f64 {
        self.loss * 100.0
    }
}

/// Whether a session sends one copy of each datagram or two.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DuplicationMode {
    /// One copy on the primary path.
    Single,
    /// A copy on each of two paths, de-duplicated at the egress.
    ///
    /// Costs a second copy of a ~150 kbps stream, which is nothing, and converts loss
    /// on either path into loss only when both drop the same datagram.
    Dual {
        /// The second path. Must share an egress with the primary — duplication changes
        /// the middle of the route, never the address the game server sees.
        secondary: PathId,
    },
}

/// How independently two paths fail.
///
/// Duplication only delivers `p_a * p_b` loss if the two paths fail independently.
/// Two paths through the same ingress PoP share fate completely, and duplicating
/// across them buys nothing but bandwidth.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PairDiversity {
    /// Both paths enter the overlay at the same PoP.
    pub shares_ingress: bool,
    /// Both paths traverse the same upstream transit provider, where observable.
    pub shares_transit: bool,
    /// Historical correlation of loss events, `0.0..=1.0`.
    ///
    /// This is ground truth and overrides the topology flags when they disagree:
    /// two paths that look diverse but lose packets together are not diverse.
    pub loss_correlation: f64,
}

impl PairDiversity {
    /// Fully independent paths. Useful as a test baseline; rarely true in reality.
    pub const INDEPENDENT: Self = Self {
        shares_ingress: false,
        shares_transit: false,
        loss_correlation: 0.0,
    };

    /// Effective correlation, taking the most pessimistic available signal.
    ///
    /// A shared ingress means complete shared fate regardless of what the historical
    /// correlation happens to have measured so far.
    pub fn effective_correlation(&self) -> f64 {
        if self.shares_ingress {
            return 1.0;
        }
        let topology_floor = if self.shares_transit { 0.5 } else { 0.0 };
        self.loss_correlation.clamp(0.0, 1.0).max(topology_floor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: PopId = PopId::new(1);
    const B: PopId = PopId::new(2);
    const C: PopId = PopId::new(3);

    #[test]
    fn direct_has_no_egress_and_no_hops() {
        assert_eq!(PathKind::Direct.egress(), None);
        assert_eq!(PathKind::Direct.overlay_hops(), 0);
        assert!(PathKind::Direct.is_direct());
    }

    #[test]
    fn single_pop_relay_counts_as_one_hop() {
        let p = PathKind::Relay {
            ingress: A,
            egress: A,
        };
        assert_eq!(p.overlay_hops(), 1);
        assert_eq!(p.egress(), Some(A));
    }

    #[test]
    fn two_pop_relay_counts_as_two_hops() {
        let p = PathKind::Relay {
            ingress: A,
            egress: B,
        };
        assert_eq!(p.overlay_hops(), 2);
        assert_eq!(p.ingress(), Some(A));
        assert_eq!(p.egress(), Some(B));
    }

    #[test]
    fn chained_counts_as_three_hops() {
        let p = PathKind::Chained {
            ingress: A,
            transit: B,
            egress: C,
        };
        assert_eq!(p.overlay_hops(), 3);
        assert_eq!(p.egress(), Some(C));
    }

    #[test]
    fn stats_clamp_impossible_values() {
        // Negative latency and >100% loss come from arithmetic slips and bad samples.
        let s = PathStats::new(-5.0, -1.0, -2.0, 1.7, 10);
        assert_eq!(s.rtt_p50_ms, 0.0);
        assert_eq!(s.jitter_ms, 0.0);
        assert_eq!(s.loss, 1.0);
    }

    #[test]
    fn p95_is_never_below_p50() {
        let s = PathStats::new(40.0, 20.0, 1.0, 0.0, 10);
        assert_eq!(s.rtt_p95_ms, 40.0);
    }

    #[test]
    fn shared_ingress_means_fully_correlated() {
        let d = PairDiversity {
            shares_ingress: true,
            shares_transit: false,
            loss_correlation: 0.0, // measurement hasn't caught up yet
        };
        // Topology wins here: a shared ingress is shared fate, full stop.
        assert_eq!(d.effective_correlation(), 1.0);
    }

    #[test]
    fn measured_correlation_overrides_optimistic_topology() {
        let d = PairDiversity {
            shares_ingress: false,
            shares_transit: false,
            loss_correlation: 0.8,
        };
        assert_eq!(d.effective_correlation(), 0.8);
    }

    #[test]
    fn shared_transit_sets_a_pessimism_floor() {
        let d = PairDiversity {
            shares_ingress: false,
            shares_transit: true,
            loss_correlation: 0.1,
        };
        assert_eq!(d.effective_correlation(), 0.5);
    }
}
