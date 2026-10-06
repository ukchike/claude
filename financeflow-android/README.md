# FinanceFlow Android App

## Financial accuracy and recurring payments

- Income, spending, category statistics, budgets, calendars and widgets report in the primary currency. Each foreign account uses its manually entered conversion rate. Accounts without a rate are excluded and identified on financial screens. Current rates also apply to historical reports; historical FX accounting is not implemented.
- Individual entries show their account currency. CSV exports include a currency column.
- Transfers require two existing accounts with the same currency. Existing cross-currency transfers are preserved and flagged for review, not automatically rewritten.
- Dates are validated against the calendar. Month-end recurring schedules retain their original anchor day (31 January → 28 February → 31 March); leap-day yearly schedules also retain their anchor.
- Due recurring occurrences are stored separately from actual transactions. In Settings → Recurring, choose **Mark paid / Mark received**, enter the actual date and amount, or **Skip**. If a payment is already imported or manually recorded, skip it to avoid double counting.
- Previously posted recurring transactions remain unchanged. Existing schedules use their stored next due date as the migration anchor because older versions did not retain the original anchor.
- Budget rollover accumulates unused amounts and overspending from its saved start period. Existing budgets start this calculation in the update's current period. Editing budget configuration resets that baseline; earlier limits are not reconstructed.
- Reporting currency changes are blocked once financial records exist, preventing accidental relabelling of budgets and amounts. Accounts with financial history or pending schedules cannot be deleted.

## Validation

From the repository root:

```sh
node --test tests/financial-accuracy.test.cjs
```

GitHub Actions runs these tests before building both Android release flavours.

## Device acceptance checks

1. Export a JSON backup before updating. Install the same flavour already on your phone; Standard and Full use different application IDs.
2. Compare the existing transaction count and account balances after updating.
3. Create a small recurring entry in a test account. A due occurrence must not change the balance until confirmed; cancelling confirmation must also leave it unchanged.
4. Confirm an occurrence with an actual date and amount. The balance should change once. Reopen the app and verify no duplicate posting.
5. Skip an occurrence already recorded manually; verify the balance does not change.
6. If you use foreign accounts, set a manual rate and check converted report totals. Verify a missing-rate warning and blocked cross-currency transfers.
7. Export and restore a backup on a separate test installation to check pending occurrences.
