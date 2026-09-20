# Projections

Two local apps live in this repo. **`npm run dev` is unchanged** — it still serves the NBA live player-projection dashboard.

## NBA live player projections

```bash
npm install
npm run dev
```

http://localhost:3000 — player PTS/REB/AST projections from ESPN box scores.

## FanDuel pace totals companion (this branch)

Live **game / quarter / half / team totals** from possessions and shot volume. Paste FanDuel lines. Does not scrape FanDuel or place bets.

```bash
cd fanduel-pace-totals
npm install
npm run dev
```

Or from repo root: `npm run dev:totals` after installing in that folder. Full usage, league coverage, and env keys: [`fanduel-pace-totals/README.md`](fanduel-pace-totals/README.md).
