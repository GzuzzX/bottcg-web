# Deep Audit Report vs RuleBook 3.2 (SD01 Set) — FIXED (2026-09-25)

Regression: `npm test` 24 pass. Generated scripts reproduce via `node tools/compile.js` (HAND 35 / AUTO 627).
Existing summon/build payments remain functional (exact-pay `_podi` preserved).

## Table 1: SD01 Print Code Audit — FIXED

| Print Code | Name | Status | Fix | Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **SD01-001** | พระอิศวร | **FIXED** | `card-scripts.js` HAND `condData:{podi:true}` + `side:either`; `tools/compile.js` `splitTrigger` จุติ `จ่าย Cost/พอดี` → `podi` (exact-payment vs paid-summon reconciled: `_podi` = paidSum===cost) | `tests/sd01.test.js` free summon no trigger; paid triggers -4 |
| **SD01-002** | พระนารายณ์ | **FIXED** | `card-scripts.js` HAND `onAttack buffSelf +2`; `tools/compile.js` `pBuff` bare `POWER +N จนจบเทิร์น` → `buffSelf`; `engine.js` `hasOnAttackScript` prevents fallback double + delta to current `power` (exactly +2/attack until turn end) | `tests/sd01.test.js` +2 then +4 stacking, no double |
| **SD01-003** | พระอินทร์ | **FIXED** | HAND `podi` + `either` (was `mine`) | `tests/sd01.test.js` (shared podi path) |
| **SD01-004** | นนทก | **OK** | unchanged | aura mine correct |
| **SD01-005** | เมียพระอิศวร | **FIXED** | HAND `podi` for draw 3 | `tests/sd01.test.js` |
| **SD01-006 ถึง 015** | vanilla | **OK** | unchanged | - |
| **SD01-016** | น้ำแดง | **OK** | unchanged (`parsePowerMods` + centralized `attachEquip`) | - |
| **SD01-017** | อุบัติเหตุ | **FIXED** | `tools/compile.js` `tryResponse` → `destroy {either,avatar,targetSummoned}`; `effects.js` `runOps/doResponse/resolveQueued` event-bound `ev.card` first | `tests/sd01.test.js` weak summoned dies, strong lives |
| **SD01-018** | ความยุติธรรมสำหรับนนทก | **FIXED** | `card-scripts.js` HAND `cost:{discard:1,discardSymbol:เทพ,discardAvatarSymbol:เทพ}` + `tools/compile.js` `ทิ้ง:…` onResolve cost + `parseCostHead` `จากบนมือ N ใบ`; `engine.js` GEM+discard atomic pre-pay + `_extraPaid` (no double charge in `onMagicResolve`) | `tests/sd01.test.js` invalid draws/consumes nothing; valid pays once draws 2 |
| **SD01-019** | ฮ่าๆ | **FIXED** | HAND `either+symbolเทพ` (was `mine`) | manual (side either) |
| **SD01-020** | เขาไกรลาส | **FIXED** | `effects.js` `powerAura` includes `st.land`; `tools/compile.js` `auraMatch` `สนามทุกใบ` w/o side → `either` (both sides) | `tests/sd01.test.js` both +1, stops when removed |
| **SD01-021 ถึง 025** | Life | **OK** | unchanged (`delayedLife`) | - |

## CORE ENGINE SYSTEM BUGS — FIXED

**1. `avatarLimitOk` — FIXED** (`engine.js` `avatarLimitOk(p,incoming)`): 4 non-token max + 6 total considering incoming (`isToken`). Coverage `tests/capacity-equip.test.js` (4N+2T ok; 5th N / 7th total rejected).

**2. Equipped Dual-Zone Leak — FIXED** (`engine.js` `removeFromZones/detachEquipCentral/attachEquip`, `st.land` clearing in `removeFromZones/destroyInst`): purge `p.magic` (+other zones) before hell, no stale refs/duplicate triggers, Land destruction clears `st.land`. Coverage `tests/capacity-equip.test.js` + `tests/sd01.test.js` Land removal.

**3. Magic/React Cost — FIXED** (see AUDIT-BUGS BUG 1/2): GEM for all subtypes + additional costs atomic; generated scripts reproduce.

Browser smoke (manual): payment cancellation changes nothing (`openMagicPay/openQueuedPicks` cancel path); response use/pass via `drainQueues` (negation prevents, pass resumes once); AI suspension (`wait-human`); online replay (`magic` with `payUids/discard`, `reactUse/reactPass/ability` applied once).
