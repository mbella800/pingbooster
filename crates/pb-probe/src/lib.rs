//! Path measurement, scoring and selection.
//!
//! This crate is the product. Everything else — the tunnel, the UI, the installer — is
//! machinery for carrying out the decision made here.
//!
//! Three stages:
//!
//! 1. [`stats`] turns raw probe results into a quality summary.
//! 2. [`score`] turns a summary into a single comparable cost, weighted the way players
//!    actually perceive network quality rather than the way it is conventionally reported.
//! 3. [`select`] picks a path, with hysteresis, treating "don't accelerate" as a
//!    legitimate and frequent answer.
//!
//! [`duplication`] then decides whether to send one copy of each datagram or two.
//!
//! The unit tests here are the specification. Route selection fails *silently* — a bad
//! weighting produces a working product that simply doesn't help anyone, which no
//! integration test will catch. So the intended behaviour is pinned numerically.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod duplication;
pub mod score;
pub mod select;
pub mod stats;

pub use score::{cost, Weights};
pub use select::{select, Candidate, DirectReason, Selection};
pub use stats::Accumulator;
