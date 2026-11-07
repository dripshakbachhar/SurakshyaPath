# Development Workflow — SurakshyaPath Research Lab

## Goal

Deliver the research-first product in small, reviewable increments while protecting the manuscript's validated data and methods.

## The repeatable loop

Each task follows this exact sequence:

1. **Choose one vertical slice.** State the user-visible outcome, affected files, research dependencies, and acceptance checks before editing.
2. **Inspect the current implementation.** Read the route, data contract, algorithm, tests, and relevant manuscript section. Confirm the source of every number.
3. **Implement narrowly.** Keep changes on `feat/research-lab-foundation` until review. Avoid unrelated refactors and avoid changing canonical inputs to solve a UI problem.
4. **Run focused checks.** First run syntax checks and the smallest relevant test. Then run the full quality sequence.
5. **Diagnose, do not bypass.** On failure, capture the failing command and error, trace the code path and input, reproduce the issue, identify the root cause, add a regression test, fix it, and rerun the failed check before continuing.
6. **Review the diff.** Check for accidental data changes, duplicated logic, inaccessible controls, unlabelled metrics, misleading claims, and unhandled error states.
7. **Commit one coherent slice.** Use a descriptive commit message and update the implementation log and backlog.
8. **Verify the branch.** Wait for GitHub Actions to pass on the latest commit. Do not mark a slice complete while its latest run is pending or failing.
9. **Continue to the next slice.** The next task begins only after the previous slice is green.

## Local quality sequence

Run from the repository root:

```bash
npm ci
npm run check:research-lab
npm run research
npm run figures
npm test
npm run validate
npm run smoke
```

The `research` command regenerates canonical experimental outputs. Review any diff before accepting it. The `figures` command builds the manuscript and website SVGs from those outputs.

## Research integrity gates

- Do not change `data/synthetic_incidents.csv`, generator seed, zone definitions, severity assumptions, or experiment parameters as a visual-design shortcut.
- Keep research severity values separate from the legacy dashboard's live UI weights.
- Every displayed number must be sourced from a tested research endpoint or a committed/generated artifact.
- Every comparison must name its baseline, budget, model, and distance definition where relevant.
- Label deterministic seeds as designed synthetic scenarios, not independent field samples.
- Never describe normalized scores as probabilities or synthetic outputs as actual incidents.
- Do not turn route and allocation simulations into real-world dispatch, staffing, or patrol recommendations.

## Failure protocol

If a check fails:

- Stop the feature sequence at the failing slice.
- Reproduce the failure on the same branch and commit.
- Inspect the full error, adjacent implementation, data contract, and relevant tests.
- Identify whether the cause is data, algorithm, API contract, browser code, environment, or CI configuration.
- Add a regression test before or with the fix.
- Rerun the failed check, then rerun the full quality sequence.
- Record root cause and resolution in `product/IMPLEMENTATION_LOG.md`.

A flaky or skipped test is not a green test.

## Release gates

1. Complete P0 and P1 product slices.
2. Obtain a passing full CI run on the reviewed commit.
3. Verify a Vercel preview against the same commit, including page load, API calls, static SVG assets, and responsive layouts.
4. Verify production project identity, Git connection, domains, environment settings, and serverless data assumptions.
5. Only then deploy to production and verify the live routes and runtime logs.

Vercel deployment is deliberately the final release phase, not part of each local feature loop.

## Content and public communication

Blogs and public posts must be derived from actual, versioned research outputs and clearly separate:
- measured computational outputs,
- design assumptions,
- synthetic scenario characteristics,
- limitations and unknowns.

Do not describe synthetic data as real incident data, or claim real-world outcomes that the experiment did not measure.
