//! Session lifecycle and orchestration.
//!
//! `pb-probe` decides which path is best. This crate decides what may actually be done
//! about it, because not every improvement is safe to apply to a session already in
//! progress. In particular it owns the sticky-egress invariant — see [`session`].
//!
//! Deliberately free of I/O: [`session::Session::apply`] returns an
//! [`session::Action`] describing what the platform layer should do rather than doing it,
//! so the whole decision path is testable without a network stack, a driver, or a game.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod session;

pub use session::{Action, ActiveSession, BypassReason, RetargetError, Session, State};
