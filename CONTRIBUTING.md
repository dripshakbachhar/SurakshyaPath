# Contributing to SurakshyaPath

## Development

```bash
npm install
npm run local
```

The application is then available at `http://localhost:3000` by default. Use `PORT=4000 npm run local` to choose another port.

## Validation

Before opening a pull request, run:

```bash
npm test
npm run validate
npm run research
npm run figures
```

Research outputs should remain reproducible. If an algorithm or modelling assumption changes, update the corresponding research documentation and tests in the same change.

## Engineering principles

- Prefer small, testable modules over large route handlers.
- Keep live-dashboard assumptions separate from research-only assumptions.
- Validate external input at the API boundary.
- Do not present synthetic experiments as real-world predictions.
- Keep deterministic experiments deterministic.
- Document meaningful limitations instead of hiding them.
