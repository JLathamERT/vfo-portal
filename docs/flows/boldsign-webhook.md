# BoldSign webhook flow

What happens when BoldSign tells the system that a document was signed or completed.

## Trigger

BoldSign POSTs JSON with `body.event.eventType` and `body.context.documentId` (or `body.data.documentId`) when:
- A signer signs (`Signed`)
- The final required signer signs and the document is fully executed (`Completed`)

The BoldSign webhook URL is configured **outside this codebase** in the BoldSign account settings.

## Current cascade (4-level lookup as of 2026-05-28)

Both handlers (standalone `boldsign-webhook` function AND the embedded `maybeHandleBoldSignWebhook` in `vfo-admin-api/router/webhooks.ts`) now cascade through four onboarding-flow tables, looking up the document ID at each level. First match wins; subsequent levels are skipped.

```
parse body → eventType + documentId
  ├─ Level 1: pipeline_map1 WHERE boldsign_doc_id = documentId
  │     match: update c17/c18; no chain (pre-refactor behavior preserved)
  ├─ Level 2 (MAP1 miss): client_tax_plans WHERE boldsign_doc_id = documentId
  │     match: update client_signed/ceo_signed
  │       chain TAX_ceocountersign on non-CEO Signed
  │       chain TAX_stripecustomer on Completed
  ├─ Level 3 (Tax miss): advisor_onboarding WHERE boldsign_document_id = documentId
  │     match: update agreement_signed_by_advisor_at / _ceo_at
  │       chain ADVISOR_ceocountersign on non-CEO Signed
  │       chain ADVISOR_stripecustomer on Completed
  └─ Level 4 (Advisor miss): accountant_onboarding WHERE boldsign_document_id = documentId
        match: update agreement_signed_by_accountant_at / _ceo_at
          chain ACCOUNTANT_ceocountersign on non-CEO Signed
          chain ACCOUNTANT_stripecustomer on Completed
        no match: return 200 OK { ok: true, note: 'No pipeline, tax plan, advisor, or accountant onboarding found' }
```

Return shape: `{ ok: true, branch: 'tax' | 'advisor' | 'accountant' }` so the matched pipeline shows up in `net._http_response` for debugging. MAP1 branch returns plain `{ ok: true }` (legacy).

**CEO signer email is hardcoded `aanderson@elitert.com` in every branch.** Any other signer email on a `Signed` event is treated as the counterparty (client / advisor / accountant).

> **⚠️ Latent bug (inert — see GOTCHAS.md gotcha #46):** the signer email is read as `body.data?.signerDetails?.signerEmail`, but BoldSign delivers `signerDetails` as an **array**, so this is always `undefined` → `""`. The `Signed (CEO email)` branch therefore **never matches** — every `Signed` event takes the counterparty branch. This is currently harmless ONLY because the counterparty always signs first (correct) and the CEO always signs last, so `ceo_signed` is actually set by the **`Completed`** event (which doesn't check email). If signing order ever changes or a 3rd signer is added after the CEO, fix the array parse + use the sandbox-aware CEO email first.

The pre-CEO-countersign parser in `ceo-countersign.ts` (both advisor and accountant) had a latent bug where the BoldSign field-read lookup never matched. Fixed 2026-05-28 with a permissive multi-key lookup + fallback to `signerDetails[0]` + multi-key field-id match + multi-value truthy + soft-fail with admin notification + diagnostic shape dump on read failure. The Gmail draft to Anton always sends now — read failures only block the silent `payment_amount=0` writeback. See GOTCHAS.md gotcha #38.

## Two possible handlers (only ONE should be the live target)

| Handler | URL | Source | Chains downstream? |
|---|---|---|---|
| **Standalone function** | `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/boldsign-webhook` | [`C:\vfo-edge-functions\supabase\functions\boldsign-webhook\index.ts`](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts) | **Yes** |
| **Embedded in admin-api** | `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api` (gated by `body.event?.eventType` shape) | `vfo-admin-api/router/webhooks.ts::maybeHandleBoldSignWebhook` | **Yes (since 2026-05-28)** — Tax + Advisor + Accountant branches all chain. Only the original MAP1 branch is no-chain. |

Both handlers do the same database writes AND chain pattern except for the MAP1 branch where only the standalone chains. **Standalone is the BoldSign-configured target per recent testing** (request id `319f951c-...` traced 2026-05-28); embedded handler is the safety net if a future webhook config change misroutes.

## Standalone handler step-by-step

[boldsign-webhook/index.ts](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts):

1. Returns `200 OK` for any non-POST (preflight friendly).
2. Parses JSON body. On parse failure, returns `200 OK` (silent).
3. Extracts `eventType` and `documentId`. If either missing, returns `200 OK`.
4. Looks up `pipeline_map1` by `boldsign_doc_id`. If not found, returns `200 OK`.

### `eventType === "Completed"`

[Lines 40-58](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts):

1. UPDATEs `pipeline_map1` SET `c17_client_signed='Yes'`, `c18_ceo_signed='Yes'`, `updated_at=now()`.
2. **Chains** (server-to-server fetch with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`):
   ```
   POST /functions/v1/vfo-admin-api
   { action: "automation_CONTRACT_stripecustomer", client_id: pipeRow.client_id }
   ```
3. Catches chain failure as non-fatal (logs and continues).

### `eventType === "Signed"` with CEO email

[Lines 64-69](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts):

The CEO email is hardcoded at line 64: `aanderson@elitert.com`. If the signer's email matches:

1. UPDATEs `pipeline_map1.c18_ceo_signed='Yes'`.
2. No chain. (The `Completed` event will fire shortly after and trigger the chain.)

### `eventType === "Signed"` with client (or any other) email

[Lines 71-91](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts):

1. **Idempotency check**: if `pipeRow.c17_client_signed === 'Yes'`, returns `200 OK` without doing anything.
2. UPDATEs `pipeline_map1.c17_client_signed='Yes'`.
3. **Chains**:
   ```
   POST /functions/v1/vfo-admin-api
   { action: "automation_CONTRACT_ceocountersign", client_id: pipeRow.client_id }
   ```

## Embedded handler step-by-step

[admin-api:544-583](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts):

Same database writes as standalone, **without the chain calls**:

- `Completed` → set both columns to 'Yes'.
- `Signed` (CEO email) → set `c18_ceo_signed='Yes'`.
- `Signed` (anyone else) → set `c17_client_signed='Yes'`.

> Notable difference: the embedded version is NOT idempotent on the `c17_client_signed='Yes'` re-signal. It happily overwrites with the same value. Functionally equivalent but means a duplicate webhook delivery would touch the same row twice.

## Tables touched

- **Read:** `pipeline_map1` (lookup by `boldsign_doc_id`).
- **Written:** `pipeline_map1` (`c17_client_signed`, `c18_ceo_signed`, `updated_at`).

## Downstream chains (standalone only)

| Event | Chain target |
|---|---|
| `Signed` (non-CEO) | `automation_CONTRACT_ceocountersign`, **which since 2026-11-13 also chains `automation_CONTRACT_stripecustomer`** → the client's payment email goes out at the same moment as Anton's countersign request |
| `Completed` | `automation_CONTRACT_stripecustomer` again: a no-op for the money (the customer already exists), it only takes any deferred ERT vault copy |
| `Signed` (CEO) | none — waits for `Completed` |

**Payment at signing, every pipeline (2026-11-13).** The same holds for Tax, Advisor, Accountant and the Specialist licence: each `*_ceocountersign` chains its own `*_stripecustomer` (Advisor / Accountant after the checkbox read prices the row), so the client never waits for Anton to pay. This file and `router/webhooks.ts` were not changed for it. The chain map, the idempotency of the second call and the vault-copy rule: [../architecture/07-server-chains.md](../architecture/07-server-chains.md) *The agreement → payment hop*.

## Authentication

**Neither** webhook handler verifies a BoldSign webhook secret. Both accept any POST with the right body shape. Authentic-looking webhooks could in theory be forged by anyone who knows a `boldsign_doc_id` — though the actions are state mutations only on existing pipeline rows, not arbitrary inserts. Risk is bounded but worth noting.

BoldSign supports webhook secrets but this is unconfigured.

## Failure modes

1. **Wrong handler is the configured target** — if the embedded handler is configured, `c17/c18` advance correctly but `automation_CONTRACT_ceocountersign` and `automation_CONTRACT_stripecustomer` are never invoked. Pipeline stalls. Manual intervention required.
2. **Both handlers configured** — both run. The standalone runs first, chains. The admin-api embedded runs and re-writes the same columns (no-op). Probably benign but redundant.
3. **`pipeline_map1` row missing** — webhook is received before the row exists. Both handlers return 200 OK silently. The signature event is lost; admin would need to re-send the agreement.
4. **Chain call fails** (e.g., admin-api function is down, network error) — caught and logged. The DB UPDATEs already succeeded, so the column says signed but no email/customer is created. Manual replay required.
5. **Duplicate `Signed` events** — standalone handles via idempotency check. Embedded does not, but the result is the same column value, so functionally idempotent.
6. **`Signed` with unrecognized signer email** — falls through to the "client" branch and sets `c17_client_signed='Yes'`. If a third signer were ever added (currently always 2), this would misroute. Not currently an issue with the 2-signer agreement template.

## Open questions

1. Which URL is configured in BoldSign? (Cannot verify from code.)
2. Is a BoldSign webhook secret intended? Currently none configured; signature verification would be a hardening step.

## Cross-references

- Master flow: [contract-and-payment.md](contract-and-payment.md#step-5--client-signs-in-boldsign)
- BoldSign integration detail: [../integrations/boldsign.md](../integrations/boldsign.md)
- Pipeline columns: [../tables/pipeline.md](../tables/pipeline.md)
