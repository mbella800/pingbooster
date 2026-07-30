//! Deciding whether to send one copy of each datagram or two.
//!
//! Game traffic is ~150 kbps of small datagrams, so a second copy is essentially free.
//! Sending one over a second, independent path and de-duplicating at the egress buys two
//! things:
//!
//! - **Loss becomes the product of the two paths' loss.** 2% and 2% become 0.04%.
//! - **Latency becomes `min(rtt_a, rtt_b)`** rather than an average, which truncates the
//!   upper tail of the jitter distribution — precisely what players feel.
//!
//! It is not unconditional. When the primary path is healthy the second copy buys nothing
//! and still costs relay capacity, so duplication escalates on evidence.

use pb_proto::{DuplicationMode, PairDiversity, PathId, PathStats};

/// When to escalate to two paths.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Thresholds {
    /// Loss fraction at or above which loss reduction is worth pursuing.
    pub enable_loss: f64,
    /// Jitter in milliseconds at or above which the `min()` effect is worth pursuing.
    pub enable_jitter_ms: f64,
    /// Combined loss must fall to at most this fraction of the primary's loss.
    ///
    /// Stops us duplicating across two paths that share fate, where the arithmetic
    /// improvement is negligible and the capacity cost is not.
    pub min_improvement_factor: f64,
    /// A secondary this lossy is not worth carrying.
    pub max_secondary_loss: f64,
    /// A secondary slower than this multiple of the primary's p95 is rejected.
    ///
    /// Its copies would lose every race, so it contributes nothing but load. Without this
    /// check a distant path looks attractive purely because multiplying loss fractions
    /// always produces a smaller number.
    pub max_secondary_rtt_factor: f64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            enable_loss: 0.005,
            enable_jitter_ms: 10.0,
            min_improvement_factor: 0.5,
            max_secondary_loss: 0.15,
            max_secondary_rtt_factor: 1.5,
        }
    }
}

/// A candidate second path.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SecondaryOption {
    /// Identifier of the candidate.
    pub id: PathId,
    /// Its measured quality.
    pub stats: PathStats,
    /// How independently it fails relative to the primary.
    pub diversity: PairDiversity,
}

/// Why the decision came out the way it did. Recorded in telemetry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DuplicationReason {
    /// Primary path is healthy; a second copy would buy nothing.
    PrimaryHealthy,
    /// No candidate was independent, fast or clean enough to help.
    NoViableSecondary,
    /// Duplicating materially reduces loss.
    LossReduction,
    /// Duplicating truncates the latency tail via the `min()` effect.
    TailReduction,
}

/// Outcome of a duplication decision.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Decision {
    /// What to do.
    pub mode: DuplicationMode,
    /// Why.
    pub reason: DuplicationReason,
    /// Expected loss fraction after applying `mode`.
    pub projected_loss: f64,
}

/// Expected loss when the same datagram is sent over two paths.
///
/// At zero correlation the paths fail independently and loss is the product. At full
/// correlation they fail together and loss is the better of the two — duplication has
/// bought nothing. Real path pairs sit between, so the model interpolates.
pub fn combined_loss(a: f64, b: f64, correlation: f64) -> f64 {
    let a = a.clamp(0.0, 1.0);
    let b = b.clamp(0.0, 1.0);
    let rho = correlation.clamp(0.0, 1.0);
    let independent = a * b;
    let dependent = a.min(b);
    independent + rho * (dependent - independent)
}

/// Decides between single-path and dual-path transmission.
pub fn decide(primary: &PathStats, options: &[SecondaryOption], t: &Thresholds) -> Decision {
    let needs_loss_help = primary.loss >= t.enable_loss;
    let needs_tail_help = primary.jitter_ms >= t.enable_jitter_ms;

    if !needs_loss_help && !needs_tail_help {
        return Decision {
            mode: DuplicationMode::Single,
            reason: DuplicationReason::PrimaryHealthy,
            projected_loss: primary.loss,
        };
    }

    let rtt_ceiling = primary.rtt_p95_ms * t.max_secondary_rtt_factor;
    let best = options
        .iter()
        .filter(|o| o.stats.loss <= t.max_secondary_loss && o.stats.rtt_p95_ms <= rtt_ceiling)
        .map(|o| {
            let projected = combined_loss(
                primary.loss,
                o.stats.loss,
                o.diversity.effective_correlation(),
            );
            (o, projected)
        })
        .min_by(|(a_opt, a_loss), (b_opt, b_loss)| {
            a_loss
                .partial_cmp(b_loss)
                // Equal projected loss: prefer the faster path, since it wins more races.
                .unwrap_or(core::cmp::Ordering::Equal)
                .then(
                    a_opt
                        .stats
                        .rtt_p95_ms
                        .partial_cmp(&b_opt.stats.rtt_p95_ms)
                        .unwrap_or(core::cmp::Ordering::Equal),
                )
        });

    let Some((option, projected)) = best else {
        return Decision {
            mode: DuplicationMode::Single,
            reason: DuplicationReason::NoViableSecondary,
            projected_loss: primary.loss,
        };
    };

    let loss_benefit = needs_loss_help && projected <= primary.loss * t.min_improvement_factor;

    if loss_benefit || needs_tail_help {
        Decision {
            mode: DuplicationMode::Dual {
                secondary: option.id,
            },
            reason: if loss_benefit {
                DuplicationReason::LossReduction
            } else {
                DuplicationReason::TailReduction
            },
            projected_loss: projected,
        }
    } else {
        Decision {
            mode: DuplicationMode::Single,
            reason: DuplicationReason::NoViableSecondary,
            projected_loss: primary.loss,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    fn stats(p95: f64, jitter: f64, loss: f64) -> PathStats {
        PathStats::new(p95 * 0.8, p95, jitter, loss, 100)
    }

    fn option(id: u8, p95: f64, loss: f64, diversity: PairDiversity) -> SecondaryOption {
        SecondaryOption {
            id: PathId::new(id),
            stats: stats(p95, 2.0, loss),
            diversity,
        }
    }

    #[test]
    fn independent_paths_multiply_loss() {
        // The headline number from the data-plane doc.
        approx(combined_loss(0.02, 0.02, 0.0), 0.0004);
        approx(combined_loss(0.05, 0.05, 0.0), 0.0025);
    }

    #[test]
    fn fully_correlated_paths_gain_nothing() {
        approx(combined_loss(0.02, 0.03, 1.0), 0.02);
    }

    #[test]
    fn partial_correlation_interpolates() {
        // Halfway between 0.0004 and 0.02.
        approx(combined_loss(0.02, 0.02, 0.5), 0.0102);
    }

    #[test]
    fn healthy_primary_stays_single() {
        let t = Thresholds::default();
        let d = decide(
            &stats(40.0, 2.0, 0.001),
            &[option(2, 42.0, 0.001, PairDiversity::INDEPENDENT)],
            &t,
        );
        assert_eq!(d.mode, DuplicationMode::Single);
        assert_eq!(d.reason, DuplicationReason::PrimaryHealthy);
    }

    #[test]
    fn lossy_primary_escalates_to_dual() {
        let t = Thresholds::default();
        let d = decide(
            &stats(60.0, 3.0, 0.03),
            &[option(2, 65.0, 0.02, PairDiversity::INDEPENDENT)],
            &t,
        );
        assert_eq!(
            d.mode,
            DuplicationMode::Dual {
                secondary: PathId::new(2)
            }
        );
        assert_eq!(d.reason, DuplicationReason::LossReduction);
        assert!(d.projected_loss < 0.001, "{}", d.projected_loss);
    }

    #[test]
    fn shared_ingress_secondary_is_refused() {
        // Same ingress means shared fate: the arithmetic gain is nil, so paying for a
        // second copy is pure waste.
        let t = Thresholds::default();
        let shared = PairDiversity {
            shares_ingress: true,
            shares_transit: true,
            loss_correlation: 0.0,
        };
        let d = decide(
            &stats(60.0, 3.0, 0.03),
            &[option(2, 62.0, 0.03, shared)],
            &t,
        );
        assert_eq!(d.mode, DuplicationMode::Single);
        assert_eq!(d.reason, DuplicationReason::NoViableSecondary);
    }

    #[test]
    fn a_far_slower_secondary_is_refused() {
        // 200 ms against a 60 ms primary: it would lose every race and add only load.
        // Without the RTT ceiling, multiplying loss fractions makes it look attractive.
        let t = Thresholds::default();
        let d = decide(
            &stats(60.0, 3.0, 0.03),
            &[option(2, 200.0, 0.001, PairDiversity::INDEPENDENT)],
            &t,
        );
        assert_eq!(d.mode, DuplicationMode::Single);
    }

    #[test]
    fn a_very_lossy_secondary_is_refused() {
        let t = Thresholds::default();
        let d = decide(
            &stats(60.0, 3.0, 0.03),
            &[option(2, 62.0, 0.40, PairDiversity::INDEPENDENT)],
            &t,
        );
        assert_eq!(d.mode, DuplicationMode::Single);
    }

    #[test]
    fn high_jitter_triggers_duplication_even_with_no_loss() {
        // Nothing to multiply, but min(rtt_a, rtt_b) still truncates the tail.
        let t = Thresholds::default();
        let d = decide(
            &stats(90.0, 25.0, 0.0),
            &[option(2, 95.0, 0.0, PairDiversity::INDEPENDENT)],
            &t,
        );
        assert_eq!(
            d.mode,
            DuplicationMode::Dual {
                secondary: PathId::new(2)
            }
        );
        assert_eq!(d.reason, DuplicationReason::TailReduction);
    }

    #[test]
    fn best_secondary_is_chosen_by_projected_loss() {
        let t = Thresholds::default();
        let correlated = PairDiversity {
            shares_ingress: false,
            shares_transit: false,
            loss_correlation: 0.9,
        };
        let d = decide(
            &stats(60.0, 3.0, 0.04),
            &[
                option(2, 62.0, 0.01, correlated),
                option(3, 63.0, 0.01, PairDiversity::INDEPENDENT),
            ],
            &t,
        );
        assert_eq!(
            d.mode,
            DuplicationMode::Dual {
                secondary: PathId::new(3)
            },
            "should prefer the genuinely independent path"
        );
    }

    #[test]
    fn ties_on_loss_break_toward_the_faster_path() {
        let t = Thresholds::default();
        let d = decide(
            &stats(80.0, 3.0, 0.02),
            &[
                option(2, 95.0, 0.01, PairDiversity::INDEPENDENT),
                option(3, 82.0, 0.01, PairDiversity::INDEPENDENT),
            ],
            &t,
        );
        assert_eq!(
            d.mode,
            DuplicationMode::Dual {
                secondary: PathId::new(3)
            }
        );
    }

    #[test]
    fn no_options_stays_single() {
        let t = Thresholds::default();
        let d = decide(&stats(60.0, 3.0, 0.03), &[], &t);
        assert_eq!(d.mode, DuplicationMode::Single);
        assert_eq!(d.reason, DuplicationReason::NoViableSecondary);
    }
}
