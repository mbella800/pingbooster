//! Tunnel datagram framing and egress de-duplication.
//!
//! Layout, all integers big-endian:
//!
//! ```text
//! ┌──────────┬──────────┬─────────┬──────────────────────────┬──────────┐
//! │ session  │   seq    │ path_id │  encrypted game datagram │ AEAD tag │
//! │  8 bytes │ 4 bytes  │ 1 byte  │        60–300 bytes      │ 16 bytes │
//! └──────────┴──────────┴─────────┴──────────────────────────┴──────────┘
//! ```
//!
//! 29 bytes of overhead, no reliability, no ordering, no congestion control. Adding any
//! of those would trade latency for delivery, which is the wrong trade for game traffic:
//! a retransmitted position update is stale on arrival. See
//! `docs/architecture/01-data-plane.md`.
//!
//! The AEAD tag is appended by the crypto layer in `pb-tunnel`; this module defines the
//! plaintext header and reserves space for the tag.

use crate::ids::{PathId, SessionId};

/// Bytes of header preceding the payload.
pub const HEADER_LEN: usize = 13;

/// Bytes of AEAD authentication tag following the payload.
pub const TAG_LEN: usize = 16;

/// Total per-datagram overhead added by the tunnel.
pub const OVERHEAD: usize = HEADER_LEN + TAG_LEN;

/// Conservative tunnel MTU.
///
/// 1280 matches the IPv6 minimum MTU and survives essentially every path in the wild.
/// Game datagrams are far smaller than this, so there is no throughput argument for
/// tuning it upward — and a silent PMTU blackhole is a miserable field bug.
pub const TUNNEL_MTU: usize = 1280;

/// Largest inner datagram that fits without fragmentation.
pub const MAX_PAYLOAD: usize = TUNNEL_MTU - OVERHEAD;

/// Errors from decoding a datagram header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WireError {
    /// Buffer too short to contain a header.
    TooShort {
        /// Bytes actually present.
        got: usize,
    },
    /// Destination buffer too small to encode into.
    BufferTooSmall {
        /// Bytes available.
        got: usize,
    },
}

/// The plaintext header of a tunnel datagram.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Header {
    /// Which session this belongs to.
    ///
    /// Sessions are identified here rather than by UDP 5-tuple, which is what lets a
    /// client roam networks without the game server observing any change.
    pub session: SessionId,
    /// Monotonic per-session counter, used for de-duplication.
    ///
    /// The space is 2^32; at 128 Hz that is over a year of continuous play, and sessions
    /// rekey long before then, so wraparound is not a case this code handles.
    pub seq: u32,
    /// Which path this copy travelled over.
    ///
    /// With duplication active, two datagrams share a `seq` and differ in `path`, which
    /// is what makes per-path loss attribution possible at the egress.
    pub path: PathId,
}

impl Header {
    /// Writes the header into the front of `out`.
    pub fn encode(&self, out: &mut [u8]) -> Result<(), WireError> {
        if out.len() < HEADER_LEN {
            return Err(WireError::BufferTooSmall { got: out.len() });
        }
        out[0..8].copy_from_slice(&self.session.get().to_be_bytes());
        out[8..12].copy_from_slice(&self.seq.to_be_bytes());
        out[12] = self.path.get();
        Ok(())
    }

    /// Reads a header from the front of `buf`.
    pub fn decode(buf: &[u8]) -> Result<Self, WireError> {
        if buf.len() < HEADER_LEN {
            return Err(WireError::TooShort { got: buf.len() });
        }
        let mut session = [0u8; 8];
        session.copy_from_slice(&buf[0..8]);
        let mut seq = [0u8; 4];
        seq.copy_from_slice(&buf[8..12]);
        Ok(Self {
            session: SessionId::new(u64::from_be_bytes(session)),
            seq: u32::from_be_bytes(seq),
            path: PathId::new(buf[12]),
        })
    }
}

/// Number of sequence numbers the de-duplication window remembers.
///
/// At 128 Hz this is eight seconds of history — far more than any plausible difference
/// in arrival time between two paths, and cheap at 128 bytes of state per session.
pub const DEDUP_WINDOW: u32 = 1024;

const WINDOW_WORDS: usize = (DEDUP_WINDOW / 64) as usize;

/// Sliding-window duplicate filter, one per session at the egress.
///
/// With duplication active the egress receives each datagram twice. It forwards the
/// first copy to arrive and drops the second, which is what makes the effective latency
/// `min(rtt_a, rtt_b)` rather than an average.
///
/// Bit `i` of the window tracks sequence number `highest - i`.
#[derive(Debug, Clone)]
pub struct DedupWindow {
    highest: u32,
    bits: [u64; WINDOW_WORDS],
    started: bool,
}

impl Default for DedupWindow {
    fn default() -> Self {
        Self::new()
    }
}

impl DedupWindow {
    /// A window that has not yet seen any datagram.
    pub const fn new() -> Self {
        Self {
            highest: 0,
            bits: [0; WINDOW_WORDS],
            started: false,
        }
    }

    /// Records `seq` and reports whether it should be forwarded.
    ///
    /// Returns `false` for a duplicate, and for anything so old it has fallen out of the
    /// window — a datagram that late is useless to the game anyway.
    pub fn accept(&mut self, seq: u32) -> bool {
        if !self.started {
            self.started = true;
            self.highest = seq;
            self.set(0);
            return true;
        }

        if seq > self.highest {
            let advance = seq - self.highest;
            if advance >= DEDUP_WINDOW {
                self.bits = [0; WINDOW_WORDS];
            } else {
                self.shift_up(advance);
            }
            self.highest = seq;
            self.set(0);
            return true;
        }

        let age = self.highest - seq;
        if age >= DEDUP_WINDOW {
            return false;
        }
        if self.get(age) {
            false
        } else {
            self.set(age);
            true
        }
    }

    /// Highest sequence number seen so far.
    pub const fn highest(&self) -> u32 {
        self.highest
    }

    fn set(&mut self, index: u32) {
        let i = index as usize;
        self.bits[i / 64] |= 1u64 << (i % 64);
    }

    fn get(&self, index: u32) -> bool {
        let i = index as usize;
        self.bits[i / 64] & (1u64 << (i % 64)) != 0
    }

    /// Ages every recorded bit by `n` positions, discarding those that fall out.
    fn shift_up(&mut self, n: u32) {
        let word_shift = (n / 64) as usize;
        let bit_shift = n % 64;

        for w in (0..WINDOW_WORDS).rev() {
            let src = w as isize - word_shift as isize;
            let mut v = 0u64;
            if src >= 0 {
                v = self.bits[src as usize] << bit_shift;
                if bit_shift > 0 && src >= 1 {
                    v |= self.bits[(src - 1) as usize] >> (64 - bit_shift);
                }
            }
            self.bits[w] = v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overhead_matches_the_documented_layout() {
        // The data-plane doc quotes 29 bytes; keep them honest with each other.
        assert_eq!(OVERHEAD, 29);
        assert_eq!(MAX_PAYLOAD, 1251);
    }

    #[test]
    fn header_roundtrips() {
        let h = Header {
            session: SessionId::new(0x0123_4567_89ab_cdef),
            seq: 0xdead_beef,
            path: PathId::new(7),
        };
        let mut buf = [0u8; HEADER_LEN];
        h.encode(&mut buf).expect("encode");
        assert_eq!(Header::decode(&buf).expect("decode"), h);
    }

    #[test]
    fn header_is_big_endian_on_the_wire() {
        // Pinned so an implementation in another language can be written against it.
        let h = Header {
            session: SessionId::new(1),
            seq: 256,
            path: PathId::DIRECT,
        };
        let mut buf = [0u8; HEADER_LEN];
        h.encode(&mut buf).expect("encode");
        assert_eq!(buf, [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
    }

    #[test]
    fn decode_rejects_short_buffers() {
        assert_eq!(
            Header::decode(&[0u8; 12]),
            Err(WireError::TooShort { got: 12 })
        );
    }

    #[test]
    fn encode_rejects_small_buffers() {
        let h = Header {
            session: SessionId::new(1),
            seq: 1,
            path: PathId::DIRECT,
        };
        let mut buf = [0u8; 5];
        assert_eq!(
            h.encode(&mut buf),
            Err(WireError::BufferTooSmall { got: 5 })
        );
    }

    #[test]
    fn first_copy_forwarded_second_dropped() {
        let mut w = DedupWindow::new();
        assert!(w.accept(100), "first copy forwards");
        assert!(!w.accept(100), "duplicate drops");
    }

    #[test]
    fn out_of_order_within_window_is_forwarded_once() {
        let mut w = DedupWindow::new();
        assert!(w.accept(100));
        assert!(w.accept(105));
        // 102 arrives late over the slower path but is still useful.
        assert!(w.accept(102));
        assert!(!w.accept(102), "its duplicate is not");
        assert_eq!(w.highest(), 105);
    }

    #[test]
    fn ancient_sequence_numbers_are_dropped() {
        let mut w = DedupWindow::new();
        assert!(w.accept(10_000));
        assert!(!w.accept(10_000 - DEDUP_WINDOW), "exactly at the edge");
        assert!(!w.accept(1), "far outside");
    }

    #[test]
    fn large_jump_forward_resets_cleanly() {
        let mut w = DedupWindow::new();
        assert!(w.accept(1));
        assert!(w.accept(1 + DEDUP_WINDOW * 3), "big gap still forwards");
        assert!(!w.accept(1 + DEDUP_WINDOW * 3), "and dedupes");
        assert!(!w.accept(1), "old entry now out of window");
    }

    #[test]
    fn shifting_preserves_history_across_word_boundaries() {
        let mut w = DedupWindow::new();
        assert!(w.accept(1000));
        // Advance by a non-multiple of 64 so the shift crosses word boundaries.
        assert!(w.accept(1070));
        // 1000 must still be remembered as seen.
        assert!(!w.accept(1000), "history survived the shift");
        assert!(!w.accept(1070));
    }

    #[test]
    fn duplication_pattern_over_two_paths() {
        // What the egress actually sees with Dual mode: interleaved copies, one per path.
        let mut w = DedupWindow::new();
        let mut forwarded = 0;
        for seq in 1..=50u32 {
            if w.accept(seq) {
                forwarded += 1; // arrived via path A
            }
            if w.accept(seq) {
                forwarded += 1; // duplicate via path B
            }
        }
        assert_eq!(forwarded, 50, "each datagram forwarded exactly once");
    }

    #[test]
    fn full_window_of_distinct_sequences_all_accepted() {
        let mut w = DedupWindow::new();
        assert!(w.accept(DEDUP_WINDOW));
        // Fill the window backwards; every one is new.
        for age in 1..DEDUP_WINDOW {
            assert!(w.accept(DEDUP_WINDOW - age), "age {age} should be new");
        }
        // Now every one is a duplicate.
        for age in 0..DEDUP_WINDOW {
            assert!(!w.accept(DEDUP_WINDOW - age), "age {age} should dedupe");
        }
    }
}
