//! Session lifecycle, and the one invariant that must never break.
//!
//! > For the lifetime of a game session, the source address the game server sees never
//! > changes.
//!
//! Game servers bind a player's session to their source address. Change it mid-match and
//! at best the server drops them; at worst it resembles session hijacking and anti-cheat
//! takes an interest. So route optimisation may freely rework the *middle* of the path —
//! ingress PoP, transit hop, duplication — but the egress is chosen once and pinned.
//!
//! This module enforces that in the type system rather than trusting callers to remember
//! it. [`ActiveSession`] holds its egress privately with no setter, and every mutation
//! goes through a method that rejects any change to it. The selector in `pb-probe` has no
//! idea a session exists and will happily propose a better path with a different egress;
//! this layer is what refuses.

use pb_probe::{Candidate, Selection};
use pb_proto::{DuplicationMode, GameId, PathId, PathKind, PopId, SessionId};

/// Why a session is not accelerating.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BypassReason {
    /// Measurement says the direct path is as good or better.
    DirectIsBetter,
    /// An overlay path was better, but not by enough to justify intervening.
    GainTooSmall,
    /// Still measuring; no decision yet.
    Measuring,
    /// The network blocks both UDP and QUIC/443, so no tunnel is possible.
    NetworkBlocksTunnel,
    /// The egress PoP failed. We fail open to direct rather than rehome mid-session.
    EgressLost,
}

/// Refusal to mutate an active session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetargetError {
    /// The requested path exits through a different PoP than the pinned egress.
    EgressWouldChange {
        /// Egress pinned at session start.
        pinned: PopId,
        /// Egress the caller asked for.
        requested: Option<PopId>,
    },
}

/// A session actively carrying game traffic through the overlay.
///
/// Construct with [`ActiveSession::start`]. The egress is pinned at construction and
/// there is deliberately no way to change it.
#[derive(Debug, Clone, PartialEq)]
pub struct ActiveSession {
    id: SessionId,
    game: GameId,
    egress: PopId,
    path: PathId,
    kind: PathKind,
    duplication: DuplicationMode,
}

impl ActiveSession {
    /// Begins a session over `kind`, pinning its egress.
    ///
    /// Returns `None` for [`PathKind::Direct`], which has no egress to pin — a direct
    /// session is represented by the absence of an `ActiveSession`, not by one with a
    /// null egress.
    pub fn start(id: SessionId, game: GameId, path: PathId, kind: PathKind) -> Option<Self> {
        let egress = kind.egress()?;
        Some(Self {
            id,
            game,
            egress,
            path,
            kind,
            duplication: DuplicationMode::Single,
        })
    }

    /// Session identifier.
    pub const fn id(&self) -> SessionId {
        self.id
    }

    /// Game being accelerated.
    pub const fn game(&self) -> GameId {
        self.game
    }

    /// The pinned egress. Read-only for the session's lifetime, by design.
    pub const fn egress(&self) -> PopId {
        self.egress
    }

    /// Path currently in use.
    pub const fn path(&self) -> PathId {
        self.path
    }

    /// Shape of the path currently in use.
    pub const fn kind(&self) -> PathKind {
        self.kind
    }

    /// Current duplication mode.
    pub const fn duplication(&self) -> DuplicationMode {
        self.duplication
    }

    /// Whether `kind` may be adopted without changing what the game server sees.
    pub fn preserves_egress(&self, kind: &PathKind) -> bool {
        kind.egress() == Some(self.egress)
    }

    /// Switches the middle of the route.
    ///
    /// Accepts any change that keeps the egress: a different ingress PoP, adding or
    /// removing a transit hop. Rejects anything that would change the address the game
    /// server sees.
    pub fn retarget(&mut self, path: PathId, kind: PathKind) -> Result<(), RetargetError> {
        if !self.preserves_egress(&kind) {
            return Err(RetargetError::EgressWouldChange {
                pinned: self.egress,
                requested: kind.egress(),
            });
        }
        self.path = path;
        self.kind = kind;
        Ok(())
    }

    /// Enables or disables duplication.
    ///
    /// A secondary path is subject to the same egress constraint: duplication adds a copy
    /// through a different middle, never through a different exit.
    pub fn set_duplication(
        &mut self,
        mode: DuplicationMode,
        secondary_kind: Option<PathKind>,
    ) -> Result<(), RetargetError> {
        if let DuplicationMode::Dual { .. } = mode {
            let kind = secondary_kind.ok_or(RetargetError::EgressWouldChange {
                pinned: self.egress,
                requested: None,
            })?;
            if !self.preserves_egress(&kind) {
                return Err(RetargetError::EgressWouldChange {
                    pinned: self.egress,
                    requested: kind.egress(),
                });
            }
        }
        self.duplication = mode;
        Ok(())
    }
}

/// What the session layer is currently doing.
#[derive(Debug, Clone, PartialEq)]
pub enum State {
    /// No game detected, nothing to do.
    Idle,
    /// Traffic is on the direct path.
    Bypassed(BypassReason),
    /// Traffic is on the overlay.
    Accelerating(ActiveSession),
}

/// Instruction for the platform layer.
///
/// Returned rather than executed so the decision logic stays testable without a network
/// stack, a driver, or a game.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Nothing to do.
    Nothing,
    /// Bring up the tunnel and route game traffic into it.
    StartTunnel {
        /// Path to use.
        path: PathId,
        /// Its shape.
        kind: PathKind,
    },
    /// Change the middle of an established route. Invisible to the game server.
    RetargetMiddle {
        /// New path.
        path: PathId,
        /// Its shape.
        kind: PathKind,
    },
    /// Remove routes and stop using the overlay.
    StopTunnel {
        /// Why.
        reason: BypassReason,
    },
    /// A better path exists but was refused because it would change the egress.
    ///
    /// Surfaced rather than silently dropped: if this fires often it means the selector
    /// is being handed candidates it should have been pre-filtered out of, which is worth
    /// knowing about in telemetry.
    DeclinedEgressChange {
        /// The path that was refused.
        path: PathId,
    },
}

/// Drives session state from selection results.
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    state: State,
    next_id: u64,
    game: GameId,
}

impl Session {
    /// A session manager for `game`, starting idle.
    pub fn new(game: GameId) -> Self {
        Self {
            state: State::Idle,
            next_id: 1,
            game,
        }
    }

    /// Current state.
    pub fn state(&self) -> &State {
        &self.state
    }

    /// The active session, if accelerating.
    pub fn active(&self) -> Option<&ActiveSession> {
        match &self.state {
            State::Accelerating(s) => Some(s),
            _ => None,
        }
    }

    /// Candidates that may be adopted without breaking the egress pin.
    ///
    /// Callers should filter with this *before* running selection while a session is
    /// active. Doing so means the selector compares only viable options, instead of
    /// choosing a winner this layer then has to refuse.
    pub fn viable<'a>(&self, candidates: &'a [Candidate]) -> Vec<&'a Candidate> {
        match self.active() {
            None => candidates.iter().collect(),
            Some(active) => candidates
                .iter()
                .filter(|c| c.kind.is_direct() || active.preserves_egress(&c.kind))
                .collect(),
        }
    }

    /// Applies a selection result and reports what the platform layer should do.
    pub fn apply(&mut self, selection: Selection) -> Action {
        match (&mut self.state, selection) {
            // No baseline: never start on a guess, and never tear down a working session
            // over a temporary measurement gap.
            (_, Selection::NoBaseline) => Action::Nothing,

            // Not accelerating, and selection agrees.
            (State::Idle | State::Bypassed(_), Selection::Direct { reason, .. }) => {
                self.state = State::Bypassed(bypass_for(reason));
                Action::Nothing
            }

            // Start accelerating.
            (State::Idle | State::Bypassed(_), Selection::Accelerate { path, kind, .. }) => {
                match ActiveSession::start(SessionId::new(self.next_id), self.game, path, kind) {
                    Some(active) => {
                        self.next_id += 1;
                        self.state = State::Accelerating(active);
                        Action::StartTunnel { path, kind }
                    }
                    // Selection proposed Direct as an "accelerate" target, which the
                    // selector should never do. Refuse rather than invent an egress.
                    None => Action::Nothing,
                }
            }

            // Accelerating, and direct now wins by more than the hysteresis margin.
            (State::Accelerating(_), Selection::Direct { reason, .. }) => {
                let reason = bypass_for(reason);
                self.state = State::Bypassed(reason);
                Action::StopTunnel { reason }
            }

            // Accelerating, and selection proposes a path. Adopt it only if it keeps the
            // egress; the selector does not know about the pin, so this is where it is
            // enforced.
            (State::Accelerating(active), Selection::Accelerate { path, kind, .. }) => {
                if path == active.path() {
                    return Action::Nothing;
                }
                match active.retarget(path, kind) {
                    Ok(()) => Action::RetargetMiddle { path, kind },
                    Err(RetargetError::EgressWouldChange { .. }) => {
                        Action::DeclinedEgressChange { path }
                    }
                }
            }
        }
    }

    /// Fails open to the direct path after losing the egress PoP.
    ///
    /// Deliberately not "rehome to another egress": that would change the source address
    /// the game server sees, disconnecting the player mid-match. A ping spike is
    /// recoverable; a disconnect is not.
    pub fn egress_lost(&mut self) -> Action {
        match self.state {
            State::Accelerating(_) => {
                self.state = State::Bypassed(BypassReason::EgressLost);
                Action::StopTunnel {
                    reason: BypassReason::EgressLost,
                }
            }
            _ => Action::Nothing,
        }
    }
}

fn bypass_for(reason: pb_probe::DirectReason) -> BypassReason {
    match reason {
        pb_probe::DirectReason::AlreadyOptimal => BypassReason::DirectIsBetter,
        pb_probe::DirectReason::GainTooSmall => BypassReason::GainTooSmall,
        pb_probe::DirectReason::NoOverlayCandidates => BypassReason::DirectIsBetter,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SG: PopId = PopId::new(1);
    const FRA: PopId = PopId::new(2);
    const AMS: PopId = PopId::new(3);
    const GAME: GameId = GameId::new(42);

    fn relay(ingress: PopId, egress: PopId) -> PathKind {
        PathKind::Relay { ingress, egress }
    }

    fn active() -> ActiveSession {
        ActiveSession::start(SessionId::new(1), GAME, PathId::new(1), relay(SG, FRA))
            .expect("relay path has an egress")
    }

    #[test]
    fn direct_cannot_form_an_active_session() {
        assert!(
            ActiveSession::start(SessionId::new(1), GAME, PathId::DIRECT, PathKind::Direct)
                .is_none(),
            "direct has no egress to pin"
        );
    }

    #[test]
    fn egress_is_pinned_at_start() {
        assert_eq!(active().egress(), FRA);
    }

    #[test]
    fn changing_ingress_is_allowed() {
        // Segment 1 addressing is invisible to the game server, so roaming is free.
        let mut s = active();
        assert_eq!(s.retarget(PathId::new(2), relay(AMS, FRA)), Ok(()));
        assert_eq!(s.path(), PathId::new(2));
        assert_eq!(s.egress(), FRA, "egress unchanged");
    }

    #[test]
    fn inserting_a_transit_hop_is_allowed() {
        let mut s = active();
        let chained = PathKind::Chained {
            ingress: SG,
            transit: AMS,
            egress: FRA,
        };
        assert_eq!(s.retarget(PathId::new(3), chained), Ok(()));
        assert_eq!(s.egress(), FRA);
    }

    #[test]
    fn changing_egress_is_refused() {
        // The invariant. If this test ever passes, players get dropped mid-match.
        let mut s = active();
        assert_eq!(
            s.retarget(PathId::new(4), relay(SG, AMS)),
            Err(RetargetError::EgressWouldChange {
                pinned: FRA,
                requested: Some(AMS),
            })
        );
        assert_eq!(s.egress(), FRA, "state unchanged after refusal");
        assert_eq!(s.path(), PathId::new(1), "path unchanged after refusal");
    }

    #[test]
    fn retargeting_to_direct_is_refused() {
        // Dropping to direct is a teardown, not a retarget.
        let mut s = active();
        assert!(s.retarget(PathId::DIRECT, PathKind::Direct).is_err());
    }

    #[test]
    fn duplication_secondary_must_share_the_egress() {
        let mut s = active();
        assert_eq!(
            s.set_duplication(
                DuplicationMode::Dual {
                    secondary: PathId::new(5)
                },
                Some(relay(AMS, FRA)),
            ),
            Ok(())
        );
        assert_eq!(
            s.duplication(),
            DuplicationMode::Dual {
                secondary: PathId::new(5)
            }
        );

        assert!(
            s.set_duplication(
                DuplicationMode::Dual {
                    secondary: PathId::new(6)
                },
                Some(relay(AMS, AMS)),
            )
            .is_err(),
            "a secondary exiting elsewhere would change what the server sees"
        );
    }

    #[test]
    fn dual_without_a_secondary_kind_is_refused() {
        let mut s = active();
        assert!(s
            .set_duplication(
                DuplicationMode::Dual {
                    secondary: PathId::new(5)
                },
                None
            )
            .is_err());
    }

    #[test]
    fn disabling_duplication_needs_no_kind() {
        let mut s = active();
        assert_eq!(s.set_duplication(DuplicationMode::Single, None), Ok(()));
    }

    #[test]
    fn viable_filters_out_mismatched_egress_while_active() {
        use pb_proto::PathStats;
        let stats = PathStats::new(50.0, 55.0, 2.0, 0.0, 100);
        let candidates = vec![
            Candidate {
                id: PathId::DIRECT,
                kind: PathKind::Direct,
                stats,
            },
            Candidate {
                id: PathId::new(1),
                kind: relay(SG, FRA),
                stats,
            },
            Candidate {
                id: PathId::new(2),
                kind: relay(AMS, FRA),
                stats,
            },
            Candidate {
                id: PathId::new(3),
                kind: relay(SG, AMS), // different egress
                stats,
            },
        ];

        let mut session = Session::new(GAME);
        assert_eq!(
            session.viable(&candidates).len(),
            4,
            "before a session starts, everything is viable"
        );

        session.state = State::Accelerating(active());
        let viable = session.viable(&candidates);
        assert_eq!(viable.len(), 3, "the mismatched egress is filtered out");
        assert!(viable.iter().all(|c| c.id != PathId::new(3)));
    }

    #[test]
    fn losing_the_egress_fails_open_to_direct() {
        let mut session = Session::new(GAME);
        session.state = State::Accelerating(active());
        assert_eq!(
            session.egress_lost(),
            Action::StopTunnel {
                reason: BypassReason::EgressLost
            }
        );
        assert_eq!(session.state(), &State::Bypassed(BypassReason::EgressLost));
    }

    #[test]
    fn no_baseline_never_tears_down_a_working_session() {
        let mut session = Session::new(GAME);
        session.state = State::Accelerating(active());
        assert_eq!(session.apply(Selection::NoBaseline), Action::Nothing);
        assert!(
            session.active().is_some(),
            "session survives a measurement gap"
        );
    }

    fn accelerate(path: u8, kind: PathKind) -> Selection {
        Selection::Accelerate {
            path: PathId::new(path),
            kind,
            path_cost: 60.0,
            direct_cost: 200.0,
            gain: 140.0,
            previous: None,
        }
    }

    #[test]
    fn applying_accelerate_starts_a_tunnel_and_pins_the_egress() {
        let mut session = Session::new(GAME);
        let action = session.apply(accelerate(1, relay(SG, FRA)));
        assert_eq!(
            action,
            Action::StartTunnel {
                path: PathId::new(1),
                kind: relay(SG, FRA)
            }
        );
        assert_eq!(session.active().expect("active").egress(), FRA);
    }

    #[test]
    fn applying_a_same_egress_path_retargets_the_middle() {
        let mut session = Session::new(GAME);
        session.apply(accelerate(1, relay(SG, FRA)));
        let action = session.apply(accelerate(2, relay(AMS, FRA)));
        assert_eq!(
            action,
            Action::RetargetMiddle {
                path: PathId::new(2),
                kind: relay(AMS, FRA)
            }
        );
        assert_eq!(session.active().expect("active").egress(), FRA);
    }

    #[test]
    fn applying_a_different_egress_path_is_declined() {
        // End-to-end version of the invariant: even if the selector insists a path with a
        // different egress is better, an in-progress session does not move to it.
        let mut session = Session::new(GAME);
        session.apply(accelerate(1, relay(SG, FRA)));
        let action = session.apply(accelerate(9, relay(SG, AMS)));
        assert_eq!(
            action,
            Action::DeclinedEgressChange {
                path: PathId::new(9)
            }
        );
        let active = session.active().expect("session survives");
        assert_eq!(active.egress(), FRA, "still on the pinned egress");
        assert_eq!(active.path(), PathId::new(1), "still on the original path");
    }

    #[test]
    fn re_selecting_the_current_path_is_a_no_op() {
        let mut session = Session::new(GAME);
        session.apply(accelerate(1, relay(SG, FRA)));
        assert_eq!(
            session.apply(accelerate(1, relay(SG, FRA))),
            Action::Nothing
        );
    }

    #[test]
    fn sessions_get_distinct_ids() {
        let mut session = Session::new(GAME);
        session.apply(accelerate(1, relay(SG, FRA)));
        let first = session.active().expect("active").id();
        session.egress_lost();
        session.apply(accelerate(1, relay(SG, FRA)));
        let second = session.active().expect("active").id();
        assert_ne!(first, second);
    }

    #[test]
    fn direct_selection_while_accelerating_stops_the_tunnel() {
        let mut session = Session::new(GAME);
        session.state = State::Accelerating(active());
        let action = session.apply(Selection::Direct {
            reason: pb_probe::DirectReason::AlreadyOptimal,
            direct_cost: 20.0,
            best_overlay: Some((PathId::new(1), 60.0)),
        });
        assert_eq!(
            action,
            Action::StopTunnel {
                reason: BypassReason::DirectIsBetter
            }
        );
    }
}
