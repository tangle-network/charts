# Packed FlowWaterfall integration proof

Source: 51f590c06f76b0fc7d742257c118e36c35891a7b. Beelink gate beelink2-ea64e43a759155696269a4209f140502 passed in 137s (+49s admission). No runtime dependency is added; React remains optional.

The retained tests/fixtures/charts-browser-smoke.mjs npm-packs the built library, installs that tarball in an isolated consumer, typechecks its public API and serves it over localhost HTTP. scripts/charts-browser-proof.mjs exercises the real browser without intercepted requests or mocked components. Run after npm run build, with CHARTS_REACT_VERSION=18 or 19 and an optional CHARTS_PROOF_DIR; --record slows visible interactions and saves an uncut video.

Both majors passed 12/12 checks: the original nine trace capabilities plus retained StackedBarChart pointer/keyboard/emulated-touch/top-layer/table interactions, per-row unordered timing and explicit-only status, and duplicate identity recovery. Trace playback includes actual keyboard scrubbing with clipped-bar assertions and Follow live against an advancing maximum. All five real wall-clock rates stayed within ±15% while trace limits grew. JSON retains the exact samples; unknown cost and LLM request count stay unknown.

Recorded Discovery provenance lives in docs/fixtures/discovery-waterfall-provenance.md. Screenshots show both themes and 1100/390px widths. interaction-react19.webm is the original uncut 35.56s capture, containing the retained stacked fixture and trace interactions. Both peer captures remain under /home/drew/reviews/meta-waterfall-v2/ on the author host. Emulated touch is not hardware-touch or screen-reader certification.

The unchanged isolated package-boundary and primitive tests pass (7/7). A separately retained public packed comparison uses 12 legacy consumer rows, two widths and two states (48 observations), requiring byte-identical SSR and identical computed structure/width/display/colour. It passes against charts0.14.0. Intelligence is represented by exact public props with synthetic labels; Website uses its six recorded timings and CSS. This is a package contract check, not a production deployment of those products.

The release PR runs a scrub no-op mutation against this same browser instrument: it must fail before restoring and passing. Final receipt belongs to the PR gate. Consumer adoption and served production proof follow the verified release in order.
