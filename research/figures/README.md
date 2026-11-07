# Research figures

Generated from canonical research-model scores and committed deterministic experiment results.

- `risk-model-comparison.svg` — normalized score heatmap for all four models and ten zones.
- `allocation-comparison.svg` — all per-zone allocation vectors at budgets 6, 12, and 20.
- `patrol-comparison.svg` — nearest-neighbour versus 2-opt route distances for the canonical seed.
- `robustness-comparison.svg` — per-seed rank shifts and allocation changes across five designed scenarios.

The same generated figures are copied to `public/research-lab/assets/` for the read-only Research Lab website.

Regenerate with:

```bash
npm run research
npm run figures
```

All graphics describe synthetic algorithm outputs. They are not forecasts, field evidence, road-network navigation, or operational guidance.
