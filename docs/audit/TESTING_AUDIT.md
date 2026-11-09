# Testing Audit — Phase 0

## Existing test infrastructure

The project uses Node's built-in test runner via:

`node --test test/*.test.js`

Declared verification commands include:
- `npm test`
- `npm run validate`
- `npm run research`
- `npm run figures`
- `npm run smoke`
- `npm run check:research-lab`

The CI workflow performs:
1. Dependency installation with `npm ci`.
2. Research Lab syntax checks.
3. Reproducible research pipeline.
4. Figure generation.
5. Unit and research API tests.
6. Deterministic validation.
7. Application smoke test.

## Coverage observed

### Unit tests
The inspected algorithm tests cover risk decay, risk bands, unknown incident types, deterministic zone calculations, future timestamps, peak-hour tie behavior, haversine distance, route stop limits, largest-remainder conservation, research normalization, and canonical synthetic-data/intelligence behavior.

### Research API tests
The research API tests cover:
- Research Lab and legacy static routes.
- Five research endpoints.
- Dataset metadata and synthetic disclosure.
- Model identities and rank structure.
- Allocation budget conservation.
- A specific budget-20 allocation difference.
- Route result values and route-order membership.
- Robustness seeds.
- Research endpoint read-only behavior.
- Browser JavaScript syntax.

### Smoke test
A smoke script is declared and included in CI. Its actual execution result was not available in this audit.

## Gaps

1. No demonstrated browser-driven end-to-end interaction suite.
2. No demonstrated accessibility automation or manual assistive-technology review.
3. No explicit timezone matrix test, despite local-time hour calculations.
4. No demonstrated concurrent persistence test.
5. No demonstrated import-side-effect test.
6. No demonstrated serverless persistence compatibility test.
7. No verified dependency audit result in the inspected evidence.
8. No measured test coverage report.
9. No explicit research-artifact schema validation test was identified in the inspected API test.
10. CI result for the audited commit was not returned by the available commit-workflow lookup.

## Local verification required

Run from a clean local checkout, using the lockfile and supported Node version:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run check:research-lab
npm.cmd run research
npm.cmd run figures
npm.cmd run validate
npm.cmd run smoke
npm.cmd audit --json
```

Preserve each command's exit code and output. Do not modify dependencies or regenerate committed research artifacts merely to make checks pass without first reviewing the diff.

## Recommended next testing increments

1. Add tests proving that age-only synthetic records do not produce event-hour claims.
2. Add tests for app construction without filesystem side effects.
3. Add persistence concurrency and failure-injection tests.
4. Add timezone-independent tests for any retained time calculations.
5. Add research artifact schema validation.
6. Add browser tests for core Research Lab workflows.
7. Add automated accessibility scans and manual keyboard checks.
8. Add CI reporting for dependency audit and browser checks once their scope is established.

## Conclusion

The repository has useful algorithm, API, deterministic-validation, and smoke-test foundations. This audit does not certify the current test suite as passing because no local execution or successful CI run was available for the audited commit.
