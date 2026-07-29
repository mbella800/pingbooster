import Image from "next/image";

const steps = [
  {
    number: "01",
    title: "Detect",
    copy: "Ping Optimizer recognizes the running game and the server region without touching game memory.",
  },
  {
    number: "02",
    title: "Compare",
    copy: "It measures your direct connection against available routes for latency, jitter, loss, and stability.",
  },
  {
    number: "03",
    title: "Optimize",
    copy: "Only a route that measures better is applied. Temporary changes are restored when the session ends.",
  },
];

const gameModes = [
  ["Competitive", "Prioritizes stable input timing, low jitter, and packet-loss protection."],
  ["MMO & RPG", "Favors long-session stability and protects against sudden route degradation."],
  ["Cloud gaming", "Balances latency with bandwidth, pacing, and congestion control."],
  ["Any other game", "Universal mode follows the game process and learns its network destinations."],
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
        <a className="button button-small" href="#beta">
          Get early access
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> Private European beta
          </p>
          <h1>
            One button.
            <br />
            <span>A measurably better route.</span>
          </h1>
          <p className="hero-lede">
            Ping Optimizer detects your game, compares every available path,
            and applies only changes that prove they perform better.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#beta">
              Join the free beta <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#how">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-assurances" aria-label="Product assurances">
            <span>Every game</span>
            <span>Real measurements</span>
            <span>Safe rollback</span>
          </div>
        </div>

        <div className="hero-visual" id="product">
          <div className="window-chrome">
            <div className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>Ping Optimizer — Session preview</span>
            <span className="preview-pill">LIVE</span>
          </div>
          <Image
            src="/ping-optimizer-app.png"
            width={1628}
            height={966}
            priority
            alt="Ping Optimizer desktop application showing a detected game, route improvement, and Optimize and Play button"
          />
          <div className="result-float result-float-left">
            <small>Expected improvement</small>
            <strong>−14 ms</strong>
          </div>
          <div className="result-float result-float-right">
            <span className="shield-check">✓</span>
            <div>
              <strong>Safe to apply</strong>
              <small>Automatic rollback ready</small>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-row" aria-label="Product principles">
        <p>Built around proof, not promises.</p>
        <div>
          <span>PROCESS DETECTION</span>
          <span>ROUTE COMPARISON</span>
          <span>LIVE MONITORING</span>
          <span>SESSION HISTORY</span>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-heading">
          <p className="eyebrow">One click, three decisions</p>
          <h2>The complexity stays behind the button.</h2>
          <p>
            You choose the game. Ping Optimizer handles the diagnosis,
            comparison, and safest proven configuration.
          </p>
        </div>
        <div className="step-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <span>{step.number}</span>
              <div className={`step-icon step-icon-${step.number}`}>
                <i />
              </div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section proof-section" id="proof">
        <div className="proof-copy">
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
        <div className="proof-card">
          <div className="proof-card-head">
            <div>
              <small>SESSION REPORT</small>
              <strong>Arena Strike · Frankfurt</strong>
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

      <section className="section games-section">
        <div className="section-heading compact">
          <p className="eyebrow">Every game, tuned differently</p>
          <h2>Universal support. Game-specific priorities.</h2>
        </div>
        <div className="mode-grid">
          {gameModes.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section comparison-section">
        <div className="comparison-intro">
          <p className="eyebrow">A different kind of optimizer</p>
          <h2>More control without more confusion.</h2>
        </div>
        <div className="comparison-table" role="table" aria-label="Product comparison">
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
        <div className="beta-card">
          <div>
            <p className="eyebrow">Founding beta</p>
            <h2>Help us build the honest ping optimizer.</h2>
            <p>
              Test the Windows experience, share your route data, and shape
              which games and European regions we add first.
            </p>
          </div>
          <div className="beta-offer">
            <span>Windows preview</span>
            <strong>€0 <small>during beta</small></strong>
            <ul>
              <li>Interactive desktop preview</li>
              <li>Connection diagnostics</li>
              <li>Early routing-network access</li>
              <li>No payment card required</li>
            </ul>
            <a
              className="button button-primary button-block"
              href="/downloads/ping-optimizer-windows-preview.zip"
              download
            >
              Download Windows preview
            </a>
            <small className="offer-note">
              Technical preview. Production game routing is still in
              development.
            </small>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="section-heading compact">
          <p className="eyebrow">Straight answers</p>
          <h2>Before you press Optimize.</h2>
        </div>
        <div className="faq-list">
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
