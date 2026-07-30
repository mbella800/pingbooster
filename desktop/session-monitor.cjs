"use strict";

class SessionMonitor {
  constructor({
    detectRunningGame,
    isPidRunning,
    getSessionState,
    restoreSession,
    emit,
    intervalMs = 3000,
    restoreRetryMs = 15000,
    nowFn = Date.now,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  }) {
    this.detectRunningGame = detectRunningGame;
    this.isPidRunning = isPidRunning;
    this.getSessionState = getSessionState;
    this.restoreSession = restoreSession;
    this.emit = emit;
    this.intervalMs = intervalMs;
    this.restoreRetryMs = restoreRetryMs;
    this.nowFn = nowFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.timer = null;
    this.busy = false;
    this.lastDetectedGameKey = null;
    this.failedRestoreKey = null;
    this.nextRestoreAttemptAt = 0;
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const session = this.getSessionState();
      const restoreKey = `${session.gamePid ?? "unknown"}:${session.originalPowerPlan ?? "session"}`;
      const trackedGameRunning = session.gamePid
        ? this.isPidRunning(session.gamePid, session.gameProcess)
        : false;
      if (
        session.active &&
        !trackedGameRunning &&
        this.nowFn() >= this.nextRestoreAttemptAt
      ) {
        const endedGame = session.gameName ?? "The active game";
        const result = await this.restoreSession();
        const message = result.active
          ? `${endedGame} closed, but a previous Windows session setting could not be restored automatically. Open Performance and try Restore.`
          : `${endedGame} closed. Temporary Windows settings were restored.`;
        if (!result.active || this.failedRestoreKey !== restoreKey) {
          this.emit("session:restored", {
            ...result,
            reason: "game-ended",
            message,
          });
        }
        if (result.active) {
          this.failedRestoreKey = restoreKey;
          this.nextRestoreAttemptAt = this.nowFn() + this.restoreRetryMs;
        } else {
          this.failedRestoreKey = null;
          this.nextRestoreAttemptAt = 0;
        }
      } else if (!session.active || trackedGameRunning) {
        this.failedRestoreKey = null;
        this.nextRestoreAttemptAt = 0;
      }

      const game = await this.detectRunningGame();
      const gameKey = game ? `${game.process}:${game.pid ?? "unknown"}` : "none";
      if (gameKey !== this.lastDetectedGameKey) {
        this.lastDetectedGameKey = gameKey;
        this.emit("game:changed", game);
      }
    } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.timer) return;
    void this.tick();
    this.timer = this.setIntervalFn(() => void this.tick(), this.intervalMs);
  }

  stop() {
    if (!this.timer) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
  }
}

module.exports = { SessionMonitor };
