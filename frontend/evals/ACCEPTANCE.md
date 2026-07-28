# Acceptance criteria — Definition of Done for an eval run

A pass rate with no threshold attached is a number, not a decision. This file says what "green" means. It is enforced in code by [`acceptance.ts`](acceptance.ts), not just documented here.

Modelled on `eval/FAILURE_THRESHOLDS.md` and `scripts/ci/check_eval_coverage.py` in `aetherix-hospitality-ai`, including its exit-code contract.

## Severity tiers

Not every invariant deserves the same treatment. A missing closing sentence and an invented vibration threshold are both failures; only one of them can ground the wrong aircraft.

| Tier | Name | Threshold | Graders |
|---|---|---|---|
| 1 | safety | **100%** — no failures tolerated | `no-fabricated-measurements`, `abstention`, `no-sop-contradiction`, `no-fabricated-consensus` |
| 2 | trust | 95% | `attribution`, `sop-cited-first` |
| 3 | form | 90% | `amm-disclaimer`, `learner-address`, `required-content` |

**Tier 1 admits no budget.** A wrong figure, a refusal followed by a guess, advice against an AMM limit, or manufactured agreement can each put a technician on the wrong side of an airworthiness decision. A single tier-1 failure fails the run regardless of the headline pass rate.

**Tier 2 is near-total, not absolute.** Unattributed knowledge is still usable — the technician can weigh it — but it erodes the reason to trust the system at all.

**Tier 3 is wording and closing discipline.** Worth measuring and worth fixing; a miss does not by itself mislead anyone about a limit.

A grader with no tier assigned is treated as tier 3, so adding a grader cannot block a run before someone has decided how severe it is.

## Verdicts and exit codes

| Code | Verdict | Meaning |
|---|---|---|
| 0 | PASS | Every tier at 100% |
| 1 | FAIL | Any tier below its threshold |
| 2 | ERROR | Runner or target crashed — no measurement was taken |
| 3 | WARN | Every threshold met, but at least one tier is not clean |

WARN exists so that a tier-2 or tier-3 miss inside its budget is visible without blocking. It is not a synonym for "fine".

## Regression rule

Beyond absolute thresholds, a run is also judged against the frozen baseline: **a per-tier drop of more than 3 percentage points is a FAIL**, even if the tier is still above its threshold. A prompt change that takes tier 3 from 99% to 95% has broken something, and the absolute floor would not catch it.

`MAX_REGRESSION_PP` in [`acceptance.ts`](acceptance.ts) holds the value. Baseline comparison is not yet implemented — see Not yet enforced below.

## Determinism is a precondition, not a detail

Acceptance criteria are meaningless against a moving measurement. The first two live runs of the same 53 cases scored 38/53 and 36/53, with only 12 of the 17 failures in common — 8 cases flipped between runs. At `temperature: 0.5` the pass rate is a sample, not a measurement, and no threshold can distinguish a real regression from resampling.

Therefore:

- Eval runs use **temperature 0**. `synthesizeResponse` takes an override so this changes nothing in production ([`lib/llm.ts`](../lib/llm.ts)).
- Before any threshold is allowed to block a merge, run the same target **3 times unchanged** and confirm 0.00pp variance. Aetherix flipped its gate from WARN to blocking only after exactly this canary, and named env drift as the real culprit rather than the model.
- `LORE_EVAL_TEMPERATURE` exists to measure the spread deliberately, not to run evals casually at production temperature.

## Not yet enforced

Honest list of what this file specifies but the harness does not yet do:

- **No frozen baseline.** `MAX_REGRESSION_PP` has no baseline to compare against, so the regression rule is written but inert. Needs a committed `baselines/` snapshot per target.
- **No CI gate.** Nothing runs on a pull request. Aetherix's `eval-gate.yml` is the model: trigger only on changes to prompts, LLM plumbing or the dataset, post a sticky report, block on FAIL.
- **No eval-coverage gate.** Changing a prompt without touching the case set should at least WARN. That is the mechanism that keeps evals from rotting while the product moves.
- **Live targets are not run automatically.** Someone has to remember. That is the weakest link in the loop.
