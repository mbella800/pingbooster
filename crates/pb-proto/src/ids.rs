//! Opaque identifiers.
//!
//! Each is a distinct newtype rather than a bare integer. It costs nothing at runtime
//! and it means passing a `GameId` where a `PopId` belongs is a compile error instead
//! of a routing decision made against the wrong table.

use core::fmt;

/// Identifies a point of presence (a relay site).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PopId(u16);

impl PopId {
    /// Wraps a raw PoP number.
    pub const fn new(raw: u16) -> Self {
        Self(raw)
    }

    /// The raw PoP number, for serialisation.
    pub const fn get(self) -> u16 {
        self.0
    }
}

impl fmt::Display for PopId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pop-{}", self.0)
    }
}

/// Identifies a supported game in the game database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GameId(u32);

impl GameId {
    /// Wraps a raw game number.
    pub const fn new(raw: u32) -> Self {
        Self(raw)
    }

    /// The raw game number, for serialisation.
    pub const fn get(self) -> u32 {
        self.0
    }
}

impl fmt::Display for GameId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "game-{}", self.0)
    }
}

/// Identifies one candidate route through the overlay.
///
/// Path identifiers are local to a measurement round and are not meaningful across
/// config versions — the route matrix may renumber paths on every publish.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PathId(u8);

impl PathId {
    /// The reserved identifier for the unaccelerated path.
    ///
    /// Direct is always present as a candidate and always has this id, so that
    /// "did we decide not to accelerate?" is answerable without inspecting
    /// [`crate::PathKind`].
    pub const DIRECT: PathId = PathId(0);

    /// Wraps a raw path number.
    pub const fn new(raw: u8) -> Self {
        Self(raw)
    }

    /// The raw path number.
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl fmt::Display for PathId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if *self == PathId::DIRECT {
            write!(f, "direct")
        } else {
            write!(f, "path-{}", self.0)
        }
    }
}

/// Identifies a tunnel session.
///
/// This — not the UDP 5-tuple — is what identifies a session on the wire, which is what
/// lets a client roam between networks (Wi-Fi to Ethernet, or a phone changing cell)
/// without the game server ever seeing a change. See `docs/architecture/01-data-plane.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionId(u64);

impl SessionId {
    /// Wraps a raw session number.
    pub const fn new(raw: u64) -> Self {
        Self(raw)
    }

    /// The raw session number, for serialisation.
    pub const fn get(self) -> u64 {
        self.0
    }
}

impl fmt::Display for SessionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "sess-{:016x}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_path_renders_readably() {
        assert_eq!(PathId::DIRECT.to_string(), "direct");
        assert_eq!(PathId::new(3).to_string(), "path-3");
    }

    #[test]
    fn direct_is_path_zero() {
        // The wire format and the telemetry schema both rely on this.
        assert_eq!(PathId::DIRECT.get(), 0);
    }
}
