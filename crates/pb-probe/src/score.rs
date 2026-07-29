//! Turning a quality summary into one comparable number.
//!
//! The conventional way to rank network paths is by mean round-trip time. It is the wrong
//! metric for games, and getting this wrong produces a product that runs correctly and
//! helps nobody.
//!
//! Players do not perceive mean RTT. They perceive the moments the game has to correct
//! itself: rubber-banding, a shot that didn't register, a hit that landed after they were
//! already behind cover. Those are tail events, driven by jitter and loss. A path with 45 ms
//! of dead-steady latency plays better than one averaging 30 ms with 25 ms of jitter, even
//! though every dashboard would rank the second one higher.
//!
//! So the cost function weights jitter and loss far above the mean, and uses p95 rather
//! than the median as its latency term.

use pb_proto::{PathKind, PathStats};

/// Tunable weights for the cost function.
///
/// Exposed rather than hard-coded so they can be delivered as signed config and tuned
/// against real telemetry. The defaults are the starting point, not the answer — once
/// there is data linking scores to session retention, these get fitted to it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Weights {
    /// Multiplier on jitter, relative to a millisecond of latency.
    pub jitter: f64,

    /// Cost in milliseconds per unit of loss fraction.
    ///
    /// Note the unit: loss is a fraction, so `3000.0` means one percent of loss
    /// (`0.01`) costs 30 ms. Loss is genuinely worth that much — one percent is the
    /// difference between a playable and an infuriating match.
    pub loss_ms_per_unit: f64,

    /// Cost per overlay hop.
    ///
    /// Every hop is another queue and another failure domain, so a path must earn its
    /// complexity. This also makes the direct path win ties, which is the behaviour we
    /// want: absent a real reason to intervene, don't.
    pub hop_penalty_ms: f64,

    /// Penalty applied to a path with fewer than [`Weights::min_samples`] probes.
    ///
    /// Prevents a path that got lucky on three probes from displacing one measured
    /// properly over a hundred.
    pub low_confidence_penalty_ms: f64,

    /// Probes required before a measurement is trusted without penalty.
    pub min_samples: u32,

    /// How much better a challenger must be to displace the current path.
    ///
    /// Hysteresis. Without it the selector oscillates between two near-equal paths, and
    /// every switch carries a small risk of a visible hitch.
    pub switch_margin_ms: f64,

    /// How much better than direct an overlay path must be before we accelerate at all.
    ///
    /// Directly implements the honesty principle: shaving two milliseconds is not worth
    /// routing someone's game traffic through our infrastructure, and claiming credit for
    /// it is how a product loses trust.
    pub min_gain_over_direct_ms: f64,
}

impl Default for Weights {
    fn default() -> Self {
        Self {
            jitter: 2.0,
            loss_ms_per_unit: 3000.0,
            hop_penalty_ms: 1.5,
            low_confidence_penalty_ms: 25.0,
            min_samples: 8,
            switch_margin_ms: 8.0,
            min_gain_over_direct_ms: 5.0,
        }
    }
}

/// Scores a path. Lower is better.
///
/// The result is in notional milliseconds — comparable between paths, but not a latency
/// anyone should be shown. Surface measured p50/p95 in the UI, never this.
pub fn cost(kind: &PathKind, stats: &PathStats, w: &Weights) -> f64 {
    let mut c = stats.rtt_p95_ms;
    c += w.jitter * stats.jitter_ms;
    c += w.loss_ms_per_unit * stats.loss;
    c += w.hop_penalty_ms * f64::from(kind.overlay_hops());

    if stats.samples < w.min_samples {
        c += w.low_confidence_penalty_ms;
    }

    c
}

#[cfg(test)]
mod tests {
    use super::*;
    use pb_proto::PopId;

    const A: PopId = PopId::new(1);
    const B: PopId = PopId::new(2);

    fn relay() -> PathKind {
        PathKind::Relay {
            ingress: A,
            egress: B,
        }
    }

    /// Enough samples to avoid the low-confidence penalty in tests about other things.
    fn stats(p50: f64, p95: f64, jitter: f64, loss: f64) -> PathStats {
        PathStats::new(p50, p95, jitter, loss, 100)
    }

    #[test]
    fn steady_high_latency_beats_jittery_low_latency() {
        // The headline behaviour. A mean-RTT ranking gets this backwards.
        let w = Weights::default();
        let steady = cost(&relay(), &stats(45.0, 46.0, 1.0, 0.0), &w);
        let jittery = cost(&relay(), &stats(30.0, 70.0, 25.0, 0.0), &w);
        assert!(
            steady < jittery,
            "steady 45ms ({steady}) should beat jittery 30ms ({jittery})"
        );
    }

    #[test]
    fn one_percent_loss_costs_about_thirty_milliseconds() {
        let w = Weights::default();
        let clean = cost(&relay(), &stats(40.0, 40.0, 0.0, 0.0), &w);
        let lossy = cost(&relay(), &stats(40.0, 40.0, 0.0, 0.01), &w);
        assert!((lossy - clean - 30.0).abs() < 1e-6, "{}", lossy - clean);
    }

    #[test]
    fn loss_dominates_a_large_latency_advantage() {
        // A 25 ms path with 2% loss must lose to a 60 ms path with none.
        let w = Weights::default();
        let fast_lossy = cost(&relay(), &stats(25.0, 25.0, 1.0, 0.02), &w);
        let slow_clean = cost(&relay(), &stats(60.0, 60.0, 1.0, 0.0), &w);
        assert!(
            slow_clean < fast_lossy,
            "clean 60ms ({slow_clean}) should beat 25ms with 2% loss ({fast_lossy})"
        );
    }

    #[test]
    fn scoring_uses_p95_not_median() {
        let w = Weights::default();
        // Same median, different tail. The one with the worse tail must score worse.
        let tight = cost(&relay(), &stats(30.0, 32.0, 1.0, 0.0), &w);
        let heavy_tail = cost(&relay(), &stats(30.0, 120.0, 1.0, 0.0), &w);
        assert!(tight < heavy_tail);
    }

    #[test]
    fn direct_wins_an_exact_tie() {
        // No hop penalty on direct, so identical measurements favour not intervening.
        let w = Weights::default();
        let s = stats(40.0, 42.0, 2.0, 0.001);
        assert!(cost(&PathKind::Direct, &s, &w) < cost(&relay(), &s, &w));
    }

    #[test]
    fn extra_hops_cost_something() {
        let w = Weights::default();
        let s = stats(40.0, 42.0, 2.0, 0.0);
        let single = PathKind::Relay {
            ingress: A,
            egress: A,
        };
        let chained = PathKind::Chained {
            ingress: A,
            transit: B,
            egress: PopId::new(3),
        };
        assert!(cost(&single, &s, &w) < cost(&chained, &s, &w));
    }

    #[test]
    fn hop_penalty_never_outweighs_real_quality() {
        // Hops are a tiebreaker, not a veto: a chained path that is genuinely 20 ms
        // better must still win. Otherwise chained relay — the thing that beats
        // competitors — could never be selected.
        let w = Weights::default();
        let single = cost(
            &PathKind::Relay {
                ingress: A,
                egress: A,
            },
            &stats(60.0, 62.0, 2.0, 0.0),
            &w,
        );
        let chained = cost(
            &PathKind::Chained {
                ingress: A,
                transit: B,
                egress: PopId::new(3),
            },
            &stats(40.0, 42.0, 2.0, 0.0),
            &w,
        );
        assert!(chained < single);
    }

    #[test]
    fn thin_measurements_are_penalised() {
        let w = Weights::default();
        let thin = PathStats::new(20.0, 20.0, 0.0, 0.0, 3);
        let solid = PathStats::new(30.0, 30.0, 0.0, 0.0, 100);
        assert!(
            cost(&relay(), &solid, &w) < cost(&relay(), &thin, &w),
            "a well-measured 30ms path should beat a barely-measured 20ms one"
        );
    }

    #[test]
    fn confidence_penalty_disappears_at_the_threshold() {
        let w = Weights::default();
        let below = PathStats::new(20.0, 20.0, 0.0, 0.0, w.min_samples - 1);
        let at = PathStats::new(20.0, 20.0, 0.0, 0.0, w.min_samples);
        let delta = cost(&relay(), &below, &w) - cost(&relay(), &at, &w);
        assert!((delta - w.low_confidence_penalty_ms).abs() < 1e-9);
    }
}
