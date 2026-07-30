import Image from "next/image";
import { MotionRuntime } from "./MotionRuntime";
import { GameArtworkGrid, GameArtworkRail } from "./GameArtwork";
import { LiveConsole } from "./LiveConsole";

const steps = [
  {
    number: "01",
    title: "Detect",
    copy: "Ping Optimizer recognizes the running game and the server region without touching game memory.",
    result: "Game + region found",
    meta: "PROCESS SCAN",
  },
  {
    number: "02",
    title: "Compare",
    copy: "It measures your direct connection against available routes for latency, jitter, loss, and stability.",
    result: "Best path verified",
    meta: "LIVE TEST",
  },
  {
    number: "03",
    title: "Optimize",
    copy: "Only a route that measures better is applied. Temporary changes are restored when the session ends.",
    result: "Rollback armed",
    meta: "SAFE APPLY",
  },
];

const gameModes = [
  {
    code: "FPS",
    title: "Competitive",
    copy: "Stable input timing, low jitter, and packet-loss protection.",
    signal: "Latency first",
  },
  {
    code: "RPG",
    title: "MMO & RPG",
    copy: "Long-session stability with protection from route degradation.",
    signal: "Stability first",
  },
  {
    code: "CG",
    title: "Cloud gaming",
    copy: "Latency, bandwidth, pacing, and congestion tuned together.",
    signal: "Stream balance",
  },
  {
    code: "ANY",
    title: "Any other game",
    copy: "Universal mode follows the process and learns its destinations.",
    signal: "Auto profile",
  },
];

const faqs = [
  [
    "Does it support every game?",
    "Universal mode can optimize traffic for any selected game process. Tested titles receive additional profiles tuned to their networking behavior.",
  ],
  [
    "Will it always lower my ping?",
    "No honest optimizer can promise that. If your direct route is already fastest, Ping Optimizer leaves it alone and tells you why.",
  ],
  [
    "Is this a VPN?",
    "It uses game-specific routing technology, but it is designed for performance rather than anonymous browsing. Only selected game traffic is considered for optimization.",
  ],
  [
    "Are the PC changes permanent?",
    "No. Session changes are visible, conservative, and reversible. The app restores temporary settings when the game closes.",
  ],
];

export default function Home() {
  return (
    <main>
      <MotionRuntime />
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Ping Optimizer home">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <span>
            PING <b>OPTIMIZER</b>
          </span>
        </a>
        <div className="nav-links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <a href="#beta">Beta</a>
        </div>
        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu <span>+</span></summary>
          <div>
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#proof">Proof</a>
            <a href="#beta">Beta</a>
          </div>
        </details>
        <a className="button button-small" href="#beta">
          Get early access
        </a>
      </nav>

      <section className="hero hero-v2" id="top">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-beam" aria-hidden="true" />

        <div className="hero-layout">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow">
              <span className="live-dot" /> Windows technical preview
            </p>
            <h1>
              Lower ping.
              <br />
              <span>Prove the difference.</span>
            </h1>
            <p className="hero-lede">
              One click detects your game, tests the connection, and keeps the
              direct route unless another path measures better.
            </p>
            <div className="hero-actions">
              <a className="button button-primary button-download" href="#beta">
                Download for Windows <span aria-hidden="true">↓</span>
              </a>
              <a className="text-link" href="#product">
                Watch it work <span aria-hidden="true">↘</span>
              </a>
            </div>
            <div className="launch-stats" aria-label="Technical preview facts">
              <div>
                <strong data-counter="12" data-suffix="+">12+</strong>
                <span>Launch profiles</span>
              </div>
              <div>
                <strong data-counter="3">3</strong>
                <span>Diagnostic edges</span>
              </div>
              <div>
                <strong data-counter="100" data-suffix="%">100%</strong>
                <span>Reversible</span>
              </div>
            </div>
          </div>

          <div className="network-stage" aria-label="Animated route comparison">
            <div className="stage-grid" aria-hidden="true" />
            <div className="stage-glow" aria-hidden="true" />
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
            <div className="orbit orbit-three" aria-hidden="true" />
            <div className="route-arc route-arc-one" aria-hidden="true">
              <i /><i /><i />
            </div>
            <div className="route-arc route-arc-two" aria-hidden="true">
              <i /><i />
            </div>
            <div className="network-node node-user">
              <i />
              <span>YOU</span>
              <small>Berlin</small>
            </div>
            <div className="network-node node-ams">
              <i />
              <span>AMS</span>
              <small>38 ms</small>
            </div>
            <div className="network-node node-fra">
              <i />
              <span>FRA</span>
              <small>52 ms</small>
            </div>
            <div className="route-status-card">
              <div className="route-status-head">
                <span><i /> LIVE ROUTE TEST</span>
                <b>MEASURING</b>
              </div>
              <div className="route-score-row">
                <div><small>DIRECT</small><strong>52<span>ms</span></strong></div>
                <div className="route-arrow"><i /><b>−14 ms</b></div>
                <div><small>OPTIMIZED</small><strong className="accent">38<span>ms</span></strong></div>
              </div>
              <div className="route-bars">
                <span><i /></span><span><i /></span><span><i /></span>
              </div>
            </div>
            {/* Was a made-up title ("Arena Strike"), which reads as a mockup and
                undercuts the claim that we support real games. */}
            <div className="stage-chip chip-game">
              <span>GAME DETECTED</span><strong>VALORANT</strong>
            </div>
            <div className="stage-chip chip-safe">
              <span>ROLLBACK</span><strong>Ready ✓</strong>
            </div>
          </div>
        </div>

        <LiveConsole />
      </section>

      {/* Replaced a scrolling list of game names in plain text. Players scan for
          the game they play, and a text list gives them nothing to lock onto —
          it also repeated titles and listed "EVERY GAME" as though it were one. */}
      <GameArtworkRail />

      <section className="section product-showcase" aria-label="Desktop app preview">
        <div className="showcase-copy" data-reveal>
          <p className="eyebrow">The whole session, visible</p>
          <h2>Not a magic button. A transparent one.</h2>
          <p>
            See the detected game, measured route, expected change, and every
            setting before anything touches your session.
          </p>
          <a className="text-link" href="#proof">Explore session proof <span>→</span></a>
        </div>
        <div className="hero-visual showcase-window" data-reveal>
          <div className="window-chrome">
            <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
            <span>Ping Optimizer — Session preview</span>
            <span className="preview-pill">LIVE</span>
          </div>
          <Image
            src="/ping-optimizer-app.png"
            width={1628}
            height={966}
            priority
            unoptimized
            alt="Ping Optimizer desktop application showing a detected game, route improvement, and Optimize and Play button"
          />
          <div className="scan-line" aria-hidden="true" />
          <div className="result-float result-float-left">
            <small>Expected improvement</small><strong>−14 ms</strong>
          </div>
          <div className="result-float result-float-right">
            <span className="shield-check">✓</span>
            <div><strong>Safe to apply</strong><small>Automatic rollback ready</small></div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">One click, three decisions</p>
          <h2>The complexity stays behind the button.</h2>
          <p>
            You choose the game. Ping Optimizer handles the diagnosis,
            comparison, and safest proven configuration.
          </p>
        </div>
        <div className="step-grid">
          {steps.map((step) => (
            <article className="step-card" data-reveal key={step.number}>
              <div className="step-topline">
                <span>{step.number}</span>
                <b>{step.meta}</b>
              </div>
              <div className={`step-icon step-icon-${step.number}`}>
                <i />
              </div>
              <div className="step-copy">
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <div className="step-result">
                <i />
                <span>{step.result}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section proof-section" id="proof">
        <div className="proof-copy" data-reveal>
          <p className="eyebrow">The result, not the ritual</p>
          <h2>See exactly what changed.</h2>
          <p>
            Every session compares the direct and optimized connection using
            meaningful network measurements—not a single flattering speed
            test.
          </p>
          <ul className="check-list">
            <li>Median and worst-case latency</li>
            <li>Jitter and packet-loss stability</li>
            <li>Direct-versus-relay comparison</li>
            <li>A confidence score for every recommendation</li>
          </ul>
        </div>
        <div className="proof-card" data-reveal>
          <div className="proof-card-head">
            <div>
              <small>SESSION REPORT</small>
              <strong>VALORANT · Frankfurt</strong>
            </div>
            <span>High confidence</span>
          </div>
          <div className="metric-hero">
            <div>
              <small>DIRECT</small>
              <strong>52<span>ms</span></strong>
            </div>
            <div className="metric-route" aria-hidden="true">
              <i />
              <b>−27%</b>
            </div>
            <div>
              <small>OPTIMIZED</small>
              <strong className="accent">38<span>ms</span></strong>
            </div>
          </div>
          <div className="metric-rows">
            <div><span>Jitter</span><b>9 ms</b><i>3 ms</i></div>
            <div><span>Packet loss</span><b>1.4%</b><i>0.1%</i></div>
            <div><span>95th percentile</span><b>88 ms</b><i>47 ms</i></div>
          </div>
          <p className="proof-note">
            Example interface data. Your results depend on location, ISP, and
            game server.
          </p>
        </div>
      </section>

      <section className="section games-section" id="modes">
        <div className="section-heading compact" data-reveal>
          <p className="eyebrow">Every game, tuned differently</p>
          <h2>Universal support. Game-specific priorities.</h2>
        </div>
        <div className="mode-grid">
          {gameModes.map((mode, index) => (
            <article data-reveal key={mode.title}>
              <div className="mode-topline">
                <span>0{index + 1}</span>
                <i>{mode.code}</i>
              </div>
              <h3>{mode.title}</h3>
              <p>{mode.copy}</p>
              <div className="mode-signal">
                <b />
                <span>{mode.signal}</span>
              </div>
            </article>
          ))}
        </div>

        {/* The four mode cards explain the categories; this shows the actual
            titles, which is what a player is looking for when they land here. */}
        <div data-reveal>
          <GameArtworkGrid />
        </div>
      </section>

      <section className="section comparison-section">
        <div className="comparison-intro" data-reveal>
          <p className="eyebrow">A different kind of optimizer</p>
          <h2>More control without more confusion.</h2>
        </div>
        <div className="comparison-table" data-reveal role="table" aria-label="Product comparison">
          <div className="comparison-row comparison-head" role="row">
            <span role="columnheader">Capability</span>
            <span role="columnheader">Typical booster</span>
            <strong role="columnheader">Ping Optimizer</strong>
          </div>
          {[
            ["Only changes routes when better", "Sometimes", "Measured every session"],
            ["Explains the cause of lag", "Basic ping", "Network diagnosis"],
            ["Shows before-and-after evidence", "Limited", "Full session report"],
            ["Restores temporary settings", "Varies", "Automatic rollback"],
          ].map((row) => (
            <div className="comparison-row" role="row" key={row[0]}>
              <span role="cell">{row[0]}</span>
              <span role="cell">{row[1]}</span>
              <strong role="cell"><i>✓</i>{row[2]}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="section beta-section" id="beta">
        <div className="beta-card" data-reveal>
          <div className="beta-copy">
            <p className="eyebrow">Founding beta</p>
            <h2>Help us build the honest ping optimizer.</h2>
            <p>
              Test the Windows experience, share your route data, and shape
              which games and European regions we add first.
            </p>
            <div className="beta-proof">
              <span><i /> No payment card</span>
              <span><i /> Reversible changes</span>
              <span><i /> Local session history</span>
            </div>
          </div>
          <div className="beta-offer">
            <div className="offer-head">
              <span>Windows technical preview</span>
              <b>OPEN</b>
            </div>
            <strong>€0 <small>during beta</small></strong>
            <ul>
              <li>Interactive interface tour</li>
              <li>Browser connection check</li>
              <li>No installer required</li>
            </ul>
            <a
              className="button button-primary button-block"
              href="/downloads/ping-optimizer-windows-preview.zip"
              download
            >
              Download interface preview
            </a>
            <small className="offer-note">
              Lightweight UI preview. The full Windows app is packaged
              separately; production relay routing is still in development.
            </small>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="section-heading compact" data-reveal>
          <p className="eyebrow">Straight answers</p>
          <h2>Before you press Optimize.</h2>
        </div>
        <div className="faq-list" data-reveal>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}<span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer>
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span>PING <b>OPTIMIZER</b></span>
        </a>
        <p>Better routes, proven.</p>
        <div>
          <a href="#how">How it works</a>
          <a href="#beta">Beta</a>
          <span>© 2026 Ping Optimizer</span>
        </div>
      </footer>
    </main>
  );
}
