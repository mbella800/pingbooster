//! Turning raw probe results into a quality summary.

use pb_proto::PathStats;

/// Rolling window of probe results for one path.
///
/// A probe either returns a round-trip time or is lost; both outcomes are recorded,
/// because the ratio between them *is* the loss measurement.
#[derive(Debug, Clone)]
pub struct Accumulator {
    /// `Some(rtt_ms)` for a reply, `None` for a loss. Oldest first.
    window: Vec<Option<f64>>,
    capacity: usize,
}

impl Accumulator {
    /// A window holding at most `capacity` recent results.
    pub fn new(capacity: usize) -> Self {
        Self {
            window: Vec::with_capacity(capacity),
            capacity: capacity.max(1),
        }
    }

    /// Records a successful probe.
    pub fn push_reply(&mut self, rtt_ms: f64) {
        self.push(Some(rtt_ms.max(0.0)));
    }

    /// Records a lost probe.
    pub fn push_loss(&mut self) {
        self.push(None);
    }

    fn push(&mut self, value: Option<f64>) {
        if self.window.len() == self.capacity {
            self.window.remove(0);
        }
        self.window.push(value);
    }

    /// Number of results currently held.
    pub fn len(&self) -> usize {
        self.window.len()
    }

    /// Whether no results have been recorded.
    pub fn is_empty(&self) -> bool {
        self.window.is_empty()
    }

    /// Summarises the window.
    ///
    /// Returns `None` when there is nothing to summarise, or when every probe was lost —
    /// a path with 100% loss has no meaningful latency, and reporting a latency of zero
    /// for it would make it look like the best path available.
    pub fn summarize(&self) -> Option<PathStats> {
        if self.window.is_empty() {
            return None;
        }

        let replies: Vec<f64> = self.window.iter().filter_map(|v| *v).collect();
        if replies.is_empty() {
            return None;
        }

        let loss = 1.0 - (replies.len() as f64 / self.window.len() as f64);

        let mut sorted = replies.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(core::cmp::Ordering::Equal));

        Some(PathStats::new(
            percentile(&sorted, 0.50),
            percentile(&sorted, 0.95),
            successive_difference_jitter(&self.window),
            loss,
            self.window.len() as u32,
        ))
    }
}

/// Linear-interpolated percentile of a pre-sorted slice.
fn percentile(sorted: &[f64], q: f64) -> f64 {
    match sorted.len() {
        0 => 0.0,
        1 => sorted[0],
        n => {
            let pos = q * (n - 1) as f64;
            let lo = pos.floor() as usize;
            let hi = pos.ceil() as usize;
            if lo == hi {
                sorted[lo]
            } else {
                sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
            }
        }
    }
}

/// Mean absolute difference between consecutive round-trip times.
///
/// Deliberately *not* standard deviation, which is the conventional choice and the wrong
/// one here. Standard deviation measures spread about the mean, so a path that alternates
/// 20/80/20/80 ms scores the same as one that drifts smoothly from 20 to 80 over a minute.
/// Those feel completely different to play on: the first rubber-bands constantly, the
/// second is merely slower than it was. Successive difference captures packet-to-packet
/// instability, which is what the game's interpolation has to fight.
///
/// Lost probes break the chain rather than contributing a difference — loss is already
/// accounted for separately, and treating a gap as a latency jump would double-count it.
fn successive_difference_jitter(window: &[Option<f64>]) -> f64 {
    let mut total = 0.0;
    let mut pairs = 0u32;
    let mut previous: Option<f64> = None;

    for entry in window {
        match entry {
            Some(rtt) => {
                if let Some(prev) = previous {
                    total += (rtt - prev).abs();
                    pairs += 1;
                }
                previous = Some(*rtt);
            }
            None => previous = None,
        }
    }

    if pairs == 0 {
        0.0
    } else {
        total / pairs as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    #[test]
    fn empty_accumulator_has_no_summary() {
        assert!(Accumulator::new(10).summarize().is_none());
    }

    #[test]
    fn total_loss_yields_no_summary() {
        // Critical: if this returned PathStats with rtt 0.0, a dead path would score as
        // the fastest available and win selection.
        let mut a = Accumulator::new(10);
        for _ in 0..5 {
            a.push_loss();
        }
        assert!(a.summarize().is_none());
    }

    #[test]
    fn loss_fraction_is_computed_over_all_probes() {
        let mut a = Accumulator::new(10);
        for _ in 0..8 {
            a.push_reply(20.0);
        }
        a.push_loss();
        a.push_loss();
        let s = a.summarize().expect("summary");
        approx(s.loss, 0.2);
        assert_eq!(s.samples, 10);
    }

    #[test]
    fn window_evicts_oldest() {
        let mut a = Accumulator::new(3);
        a.push_reply(10.0);
        a.push_reply(20.0);
        a.push_reply(30.0);
        a.push_reply(40.0);
        assert_eq!(a.len(), 3);
        let s = a.summarize().expect("summary");
        // 10.0 has been evicted, so the median is 30, not 25.
        approx(s.rtt_p50_ms, 30.0);
    }

    #[test]
    fn percentiles_interpolate() {
        let sorted = [10.0, 20.0, 30.0, 40.0, 50.0];
        approx(percentile(&sorted, 0.5), 30.0);
        approx(percentile(&sorted, 0.0), 10.0);
        approx(percentile(&sorted, 1.0), 50.0);
    }

    #[test]
    fn jitter_distinguishes_oscillation_from_drift() {
        // The behaviour standard deviation would miss, and the reason this metric exists.
        let oscillating = [
            Some(20.0),
            Some(80.0),
            Some(20.0),
            Some(80.0),
            Some(20.0),
            Some(80.0),
        ];
        let drifting = [
            Some(20.0),
            Some(32.0),
            Some(44.0),
            Some(56.0),
            Some(68.0),
            Some(80.0),
        ];

        let osc = successive_difference_jitter(&oscillating);
        let drift = successive_difference_jitter(&drifting);

        approx(osc, 60.0);
        approx(drift, 12.0);
        assert!(
            osc > drift * 4.0,
            "oscillation must score far worse than drift: {osc} vs {drift}"
        );

        // For contrast: both have a similar spread about the mean, so standard deviation
        // would rate them as roughly equivalent.
        let stddev = |xs: &[Option<f64>]| {
            let v: Vec<f64> = xs.iter().filter_map(|x| *x).collect();
            let mean = v.iter().sum::<f64>() / v.len() as f64;
            (v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / v.len() as f64).sqrt()
        };
        let ratio = stddev(&oscillating) / stddev(&drifting);
        assert!(
            ratio < 1.6,
            "stddev should fail to separate these (ratio {ratio})"
        );
    }

    #[test]
    fn jitter_of_a_steady_path_is_zero() {
        let mut a = Accumulator::new(10);
        for _ in 0..6 {
            a.push_reply(35.0);
        }
        approx(a.summarize().expect("summary").jitter_ms, 0.0);
    }

    #[test]
    fn loss_does_not_inflate_jitter() {
        // A gap must break the chain, not register as a jump between the values either
        // side of it — otherwise loss is counted twice, once as loss and once as jitter.
        let with_gap = [Some(20.0), None, Some(20.0), None, Some(20.0)];
        approx(successive_difference_jitter(&with_gap), 0.0);
    }
}
