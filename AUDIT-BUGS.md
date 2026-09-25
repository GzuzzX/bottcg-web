# Engine & Effects Audit Report — FIXED (2026-09-25)

Regression: `npm test` (Node built-in test runner, no browser) — 24 tests pass.
Harness: `tests/helpers.js` (HAND wins, isolated fixtures, same precedence as browser) + `tests/*.test.js`.
Failed-action tests compare zones/counters/usage/pending before/after.

## BUG 1: Magic Cards Completely Bypass GEM Costs — FIXED
* **File:Line**: `engine.js` `playMagic` (validation+commitment), `effects.js` `magicExtraCost/validateAbCost/commitAbCost`
* **Fix**: `playMagic` now accepts `payUids` + additional-cost picks, validates phase/limits/targets/equipment/GEM/extra together mutation-free, commits GEM via `payCost` + extra via `commitAbCost` before moving cards/counters. Applies to Normal/React/Modification/Land. UI (`game.html` `openMagicPay`) + AI (`ai.js` `playMagicWithPay`) supply valid payments; cancellation changes nothing.
* **Coverage**: `tests/magic-payment.test.js` (insufficient/wrong-color/duplicate/stale/self fail without mutation; valid pays once; Land enforced).

## BUG 2: React Magic From Hand Bypass GEM Costs — FIXED
* **File:Line**: `effects.js` `validateReact/commitReactGem`, `doResponse`, `resolveQueued`
* **Fix**: Shared `validateReact` (locks, effective subtype, limit exemptions, ability usage, GEM via `E.checkPay`, additional costs) used by `doResponse` (bot auto `autoGemUids`), `resolveQueued` (human `picks.payUids`), direct plays. Queued decisions preserved on validation failure (no splice until success).
* **Coverage**: `tests/magic-payment.test.js`, `tests/react-limits.test.js`, `tests/response-pause.test.js`.

## BUG 3: Human Response Chain Broken — FIXED
* **File:Line**: `effects.js` `onEvent/findResponse/queueHumanResponse/resumeIfDone`, `engine.js` `completeMagicResolve/completeSummonJuti`, `game.html` `drainQueues`, `ai.js` suspension
* **Fix**: Resumable frames with event IDs (`_evStack/_frames/_pendingEv`, `pending/completed`). `playMagic/summonAvatar/execActivated/runTriggered/declareAttack` suspend at response windows; counter-responses resolve before parent; passes scoped per-event (`_passedResponses[evId]`); unrelated actions blocked via `responsePending` while pending; repeated clicks neither duplicate nor lose (single resume). AI turns stop (`wait-human`); online replay applies each selection/continuation once (`reactUse/reactPass/ability`).
* **Coverage**: `tests/response-pause.test.js` (no effect before decision; negation prevents; pass resumes once; nested + scoping).

## BUG 4: Partial Cost Deduction on Failure — FIXED
* **File:Line**: `effects.js` `validateCostAb/commitCostAb/payCostAb`, `engine.js` `checkPay/payCost/validateGem`
* **Fix**: Split into mutation-free validation (ownership/filters/quantities/duplicates/overlapping/self/stale) + commitment. Triggers (`onPaidAsCost/onEquipHell/onDestroyed`) only after commitment. Successful combined costs consume once; failed mark nothing.
* **Coverage**: `tests/cost-atomic.test.js` (failed/duplicate/overlap leave snapshot+`fxUsed` unchanged; success consumes once).

## BUG 5: React Magic Limit Checking Occurs AFTER Paying Cost — FIXED
* **File:Line**: `effects.js` `validateReact/doResponse/resolveQueued`
* **Fix**: Unified validation orders locks→effective subtype→limit→usage→GEM→extra before any commitment. Exceeded limits consume nothing; success charges once + counters once.
* **Coverage**: `tests/react-limits.test.js`.

## BUG 6: `playMagic` Modification Target Validation Destroys Card — FIXED
* **File:Line**: `engine.js` `playMagic/checkModTarget`, `game.html` `openMagicPay`
* **Fix**: Target + `สวมใส่ได้เฉพาะ` validated before `magicUsed`/hand/GEM/extra mutation. Invalid preserves card/payment/allowance. Valid attaches via centralized `attachEquip`.
* **Coverage**: `tests/magic-payment.test.js` (invalid Modification preserves).
