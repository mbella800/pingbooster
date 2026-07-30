//! Shared types for every PingBooster component.
//!
//! The desktop client, the mobile clients, the edge agent and the control plane all
//! depend on this crate. Wire-format drift between client and server is one of the
//! most expensive bug classes in this kind of product — a field that means one thing
//! on the client and another on the server produces failures that only appear in
//! production, under load, on someone else's network. Sharing the definitions as code
//! rather than as prose makes that class of bug unrepresentable.
//!
//! Nothing here performs I/O or depends on a platform. See the workspace `Cargo.toml`
//! for why this crate is dependency-free.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod config;
pub mod ids;
pub mod path;
pub mod wire;

pub use ids::{GameId, PathId, PopId, SessionId};
pub use path::{DuplicationMode, PairDiversity, PathKind, PathStats};
