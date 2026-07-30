//! Choosing a path — including choosing not to accelerate.
//!
//! "Stay on the direct path" is a first-class outcome here, not an error case. A player in
//! Frankfurt on a Frankfurt server has an 8 ms direct path and nothing we do will improve
//! it. Telling them so, with the measurement that proves it, is what makes the claim
//! trustworthy on the routes where we *do* help.

use crate::score::{cost, Weights};
use pb_proto::{PathId, PathKind, PathStats};

/// One measured candidate route.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Candidate {
    /// Identifier used on the wire and in telemetry.
    pub id: PathId,
    /// Shape of the route.
    pub kind: PathKind,
    /// Recent measured quality.
    pub stats: PathStats,
}

/// Why we are not accelerating.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DirectReason {
    /// The direct path scored at least as well as everything else.
    ///
    /// The user-facing message is "your connection to this server is already optimal".
    AlreadyOptimal,
    /// An overlay path scored better, but not by enough to be worth intervening.
    GainTooSmall,
    /// Nothing to compare against — no overlay path had a usable measurement.
    NoOverlayCandidates,
}

/// Outcome of a selection round.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Selection {
    /// No usable direct measurement, so no honest comparison is possible.
    ///
    /// Deliberately not "accelerate anyway": without a baseline we cannot tell whether we
    /// are helping, and a booster that can't tell shouldn't act.
    NoBaseline,
    /// Stay on the direct path.
    Direct {
        /// Why.
        reason: DirectReason,
        /// Score of the direct path.
        direct_cost: f64,
        /// Best overlay path and its score, when one was measured.
        best_overlay: Option<(PathId, f64)>,
    },
    /// Accelerate over an overlay path.
    Accelerate {
        /// Chosen path.
        path: PathId,
        /// Its shape.
        ///
        /// Carried alongside the id so the session layer can pin the egress without
        /// needing the candidate list again.
        kind: PathKind,
        /// Its score.
        path_cost: f64,
        /// Score of the direct path, for the honest comparison shown in the UI.
        direct_cost: f64,
        /// How much better the chosen path scored.
        gain: f64,
        /// What we were on before, if anything.
        previous: Option<PathId>,
    },
}

impl Selection {
    /// The path to use, or `None` when there is nothing to act on yet.
    pub fn chosen(&self) -> Option<PathId> {
        match self {
            Selection::NoBaseline => None,
            Selection::Direct { .. } => Some(PathId::DIRECT),
            Selection::Accelerate { path, .. } => Some(*path),
        }
    }

    /// Whether this outcome routes traffic through the overlay.
    pub fn is_accelerating(&self) -> bool {
        matches!(self, Selection::Accelerate { .. })
    }
}

/// Picks a path from measured candidates.
///
/// `incumbent` is the path currently in use, if any. It receives a
/// [`Weights::switch_margin_ms`] discount so that a challenger must be meaningfully
/// better to displace it — without that, two near-equal paths cause the selector to
/// oscillate, and every switch is a small risk of a visible hitch.
pub fn select(candidates: &[Candidate], incumbent: Option<PathId>, w: &Weights) -> Selection {
    let effective = |c: &Candidate| {
        let base = cost(&c.kind, &c.stats, w);
        if incumbent == Some(c.id) {
            base - w.switch_margin_ms
        } else {
            base
        }
    };

    let Some(direct) = candidates.iter().find(|c| c.kind.is_direct()) else {
        return Selection::NoBaseline;
    };
    let direct_cost = effective(direct);

    let best = candidates
        .iter()
        .filter(|c| !c.kind.is_direct())
        .min_by(|a, b| {
            effective(a)
                .partial_cmp(&effective(b))
                .unwrap_or(core::cmp::Ordering::Equal)
        });

    let Some(best) = best else {
        return Selection::Direct {
            reason: DirectReason::NoOverlayCandidates,
            direct_cost,
            best_overlay: None,
        };
    };

    let overlay_cost = effective(best);
    let gain = direct_cost - overlay_cost;

    // Starting to accelerate requires clearing `min_gain_over_direct_ms`. Continuing to
    // accelerate does not — the incumbent discount already provides stickiness, and
    // demanding the startup margin every round would drop an established session back to
    // direct the moment the advantage narrowed.
    let already_accelerating = matches!(incumbent, Some(id) if id != PathId::DIRECT);
    let required = if already_accelerating {
        0.0
    } else {
        w.min_gain_over_direct_ms
    };

    if gain > required {
        Selection::Accelerate {
            path: best.id,
            kind: best.kind,
            path_cost: overlay_cost,
            direct_cost,
            gain,
            previous: incumbent,
        }
    } else {
        Selection::Direct {
            reason: if gain <= 0.0 {
                DirectReason::AlreadyOptimal
            } else {
                DirectReason::GainTooSmall
            },
            direct_cost,
            best_overlay: Some((best.id, overlay_cost)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pb_proto::PopId;

    const SG: PopId = PopId::new(1);
    const FRA: PopId = PopId::new(2);

    fn direct(p50: f64, jitter: f64, loss: f64) -> Candidate {
        Candidate {
            id: PathId::DIRECT,
            kind: PathKind::Direct,
            stats: PathStats::new(p50, p50 + jitter * 2.0, jitter, loss, 100),
        }
    }

    fn overlay(id: u8, p50: f64, jitter: f64, loss: f64) -> Candidate {
        Candidate {
            id: PathId::new(id),
            kind: PathKind::Relay {
                ingress: SG,
                egress: FRA,
            },
            stats: PathStats::new(p50, p50 + jitter * 2.0, jitter, loss, 100),
        }
    }

    #[test]
    fn local_server_stays_direct() {
        // Player and game server in the same metro. Nothing to improve, and the honest
        // answer is to get out of the way.
        let w = Weights::default();
        let c = [direct(8.0, 0.5, 0.0), overlay(1, 22.0, 1.0, 0.0)];
        match select(&c, None, &w) {
            Selection::Direct {
                reason: DirectReason::AlreadyOptimal,
                ..
            } => {}
            other => panic!("expected AlreadyOptimal, got {other:?}"),
        }
    }

    #[test]
    fn bad_international_route_gets_accelerated() {
        // The case we exist for: consumer ISP takes a poor path with loss and jitter,
        // our overlay is longer in raw hops but far steadier.
        let w = Weights::default();
        let c = [direct(180.0, 30.0, 0.03), overlay(1, 120.0, 3.0, 0.001)];
        match select(&c, None, &w) {
            Selection::Accelerate { path, gain, .. } => {
                assert_eq!(path, PathId::new(1));
                assert!(gain > 50.0, "gain was only {gain}");
            }
            other => panic!("expected Accelerate, got {other:?}"),
        }
    }

    #[test]
    fn marginal_improvement_is_declined() {
        // A couple of milliseconds of gain is not worth routing someone's traffic
        // through us. Spelled out so the intent can't drift:
        //   direct:  p95 42 + 2*jitter 1 + 0 hops     = 44.0
        //   overlay: p95 37 + 2*jitter 1 + 1.5*2 hops = 42.0
        //   gain 2.0 ms, below the 5.0 ms startup threshold.
        let w = Weights::default();
        let c = [direct(40.0, 1.0, 0.0), overlay(1, 35.0, 1.0, 0.0)];
        match select(&c, None, &w) {
            Selection::Direct {
                reason: DirectReason::GainTooSmall,
                best_overlay: Some((id, _)),
                ..
            } => assert_eq!(id, PathId::new(1)),
            other => panic!("expected GainTooSmall, got {other:?}"),
        }
    }

    #[test]
    fn no_direct_measurement_means_no_decision() {
        let w = Weights::default();
        let c = [overlay(1, 30.0, 1.0, 0.0)];
        assert_eq!(select(&c, None, &w), Selection::NoBaseline);
    }

    #[test]
    fn no_overlay_candidates_reports_why() {
        let w = Weights::default();
        let c = [direct(90.0, 10.0, 0.01)];
        match select(&c, None, &w) {
            Selection::Direct {
                reason: DirectReason::NoOverlayCandidates,
                best_overlay: None,
                ..
            } => {}
            other => panic!("expected NoOverlayCandidates, got {other:?}"),
        }
    }

    #[test]
    fn lossy_overlay_loses_to_clean_direct() {
        let w = Weights::default();
        // Overlay is 40 ms faster but drops 3% — not a trade worth making.
        let c = [direct(100.0, 2.0, 0.0), overlay(1, 60.0, 2.0, 0.03)];
        assert!(!select(&c, None, &w).is_accelerating());
    }

    #[test]
    fn hysteresis_keeps_the_incumbent_against_a_marginal_challenger() {
        let w = Weights::default();
        let c = [
            direct(200.0, 20.0, 0.02),
            overlay(1, 120.0, 2.0, 0.0),
            overlay(2, 117.0, 2.0, 0.0), // 3 ms better: inside the 8 ms margin
        ];
        match select(&c, Some(PathId::new(1)), &w) {
            Selection::Accelerate { path, .. } => assert_eq!(
                path,
                PathId::new(1),
                "should not flap to a barely-better path"
            ),
            other => panic!("expected Accelerate, got {other:?}"),
        }
    }

    #[test]
    fn a_clearly_better_challenger_wins() {
        let w = Weights::default();
        let c = [
            direct(200.0, 20.0, 0.02),
            overlay(1, 120.0, 2.0, 0.0),
            overlay(2, 95.0, 2.0, 0.0), // 25 ms better: clears the margin
        ];
        match select(&c, Some(PathId::new(1)), &w) {
            Selection::Accelerate { path, previous, .. } => {
                assert_eq!(path, PathId::new(2));
                assert_eq!(previous, Some(PathId::new(1)));
            }
            other => panic!("expected Accelerate, got {other:?}"),
        }
    }

    #[test]
    fn an_established_session_is_not_dropped_over_a_narrowed_advantage() {
        // Advantage has shrunk to 2 ms — below the 5 ms startup threshold. A session
        // already running should stay put rather than tear down the tunnel.
        let w = Weights::default();
        let c = [direct(42.0, 1.0, 0.0), overlay(1, 40.0, 1.0, 0.0)];

        assert!(
            !select(&c, None, &w).is_accelerating(),
            "would not start from scratch at this margin"
        );
        assert!(
            select(&c, Some(PathId::new(1)), &w).is_accelerating(),
            "but an established session continues"
        );
    }

    #[test]
    fn established_session_still_falls_back_when_direct_becomes_clearly_better() {
        // Stickiness must not become stubbornness: if the direct path genuinely wins by
        // more than the hysteresis margin, we get out of the way.
        let w = Weights::default();
        let c = [direct(30.0, 1.0, 0.0), overlay(1, 90.0, 5.0, 0.0)];
        match select(&c, Some(PathId::new(1)), &w) {
            Selection::Direct {
                reason: DirectReason::AlreadyOptimal,
                ..
            } => {}
            other => panic!("expected fallback to Direct, got {other:?}"),
        }
    }

    #[test]
    fn chosen_reports_direct_for_every_non_accelerating_outcome() {
        let w = Weights::default();
        let c = [direct(8.0, 0.5, 0.0), overlay(1, 40.0, 1.0, 0.0)];
        assert_eq!(select(&c, None, &w).chosen(), Some(PathId::DIRECT));
        assert_eq!(select(&[], None, &w).chosen(), None);
    }
}
