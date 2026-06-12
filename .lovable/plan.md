# David van Jaarsveldt — Wed 10 June Comp Entry Investigation

## What the logs show

Three back-to-back POS transactions on Wed 10 June, all from Sam at the bar:

| Time (UTC)  | Total | Payment Method        | Item                                 | Stripe PI                       |
| ----------- | ----- | --------------------- | ------------------------------------ | ------------------------------- |
| 08:33:23    | $20   | **customer_account** (Stripe card on file) | Week 8 Da Bears entry fee | `pi_3TghZeLpXZPXTNVB112xksF7` ✅ charged |
| 08:33:48    | $6    | credit_balance        | XXXX Gold                            | —                               |
| 08:34:22    | —     | (admin credit add)    | Manual credit +$6 (balance 14 → 20)  | —                               |
| 08:34:53    | $20   | **credit_balance**    | Week 8 Da Bears entry fee (again!)   | —                               |

## Diagnosis

1. **The comp entry fee was charged TWICE.**
   - First attempt at **08:33:23** — Sam selected **"Customer Account"** (charges saved card on file) instead of **"Credit Balance"**. Stripe charged David's card via `pi_3TghZeLpXZPXTNVB112xksF7`.
   - 90 seconds later at **08:34:53**, Sam re-ran the same comp entry fee, this time correctly against **credit_balance**, which deducted $20 from David's stored credit.
   - The first transaction was **not voided/refunded**, so David paid the $20 twice (once on card, once on credit).

2. **The $60 → $6 typo is confirmed.** At 08:34:22 Sam added "Manual credit added by admin" for **$6** (deposit_transactions row: balance_before 14 → balance_after 20). This is the entry that should have been $60.

3. **You've already corrected the credit shortfall.** On 12 June at 04:19 and 04:20 you added 2× $30 = $60, taking the balance from 0 → 60. So the credit side is square.

4. **What's still outstanding:** the $20 Stripe charge `pi_3TghZeLpXZPXTNVB112xksF7` against David's card. He's effectively paid for the comp entry twice.

## Root cause (UX)

The POS terminal exposes two adjacent options — "Customer Account" (charges Stripe card on file) and "Credit Balance" (deducts stored credit). Sam clearly intended Credit Balance the first time but tapped Customer Account by mistake. The system has no guardrail that prompts "this customer has $X credit available — use that first?" when staff pick Customer Account.

## Proposed actions

1. **Refund the $20 Stripe charge** `pi_3TghZeLpXZPXTNVB112xksF7` back to David's card (reason: `duplicate`). I can do this directly via the Stripe MCP once you switch me to build mode and approve.
2. **No credit adjustment needed** — your 2× $30 top-ups already covered the $60 typo correctly.
3. *(Optional, not in this plan unless you want it)* Add a guardrail to the POS: when staff select "Customer Account" for a customer who has a positive credit balance, show a confirmation like "David has $X credit available — charge card instead?". Say the word and I'll spec it up as a separate plan.

## Confirm to proceed

Approve this plan and I'll issue the $20 refund on `pi_3TghZeLpXZPXTNVB112xksF7`. Let me know separately if you want the POS guardrail built.
