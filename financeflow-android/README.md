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
node --test tests/*.test.cjs
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

## Statement imports and bank-alert review

Statement uploads support CSV, TSV and semicolon-delimited text, including quoted commas, escaped quotes and multiline descriptions. Excel and PDF parsing are not included.

1. Select the target account and upload a statement (up to 4 MB / 10,000 rows).
2. Check the detected header row and map the date, description and amount/direction columns. Choose day-first or month-first numeric dates.
3. Debit/Credit columns determine direction. Amount-only statements require a Type column or an explicit positive/negative convention. Category suggestions never change debit/credit direction.
4. Review all rows and selected inflow/outflow totals. Invalid/summary rows are unselected. Existing matches are unselected by default; individually include a flagged row only if it is a separate genuine transaction.
5. Confirm the selected entries. The import can be undone immediately; recent batches appear under Backup & Restore and are included in JSON backups.

Duplicate detection compares account, date, direction, amount and reference/description. Matches against manual entries, bank alerts, transfers and split totals receive review flags. This is a review aid: missing references, changed dates and different descriptions can prevent an exact match.

The Full APK detects NGN bank-alert candidates locally. Both comma-formatted and uncommaed amounts are supported. Balance-labelled amounts are excluded; multiple candidate amounts and ambiguous directions need review. The source app and notification text are visible, and unwanted sources can be ignored and subsequently allowed again.

Bank-alert confirmation requires selecting the NGN account; unknown direction requires an explicit Income/Expense choice. The date defaults to the notification date and must be checked. Existing matching amounts/records trigger an additional warning. Alerts remain unreconciled until you verify them against your bank statement. Notifications are never posted automatically. Detection is format-dependent; anonymised real-bank examples are needed for bank-specific acceptance testing.

GitHub Actions also compiles and runs the pure Java BankAlertParserTest before building the APKs.

### Description-based import categories

Statement review suggests category and subcategory from specific description phrases, or an unambiguous previous classification of the same description (reference IDs are ignored). Existing custom categories are supported through previous classifications. Generic POS, transfer or payment wording, conflicting history, and multiple rule matches fall back to Other for review. Suggestions never change debit/credit direction. Each row has editable category/subcategory selectors before confirmation; confirmed corrections inform later matching descriptions. No external AI service is used.

### Backup restore safeguards

JSON restore validates record shapes, financial amounts/dates, account references, duplicate IDs and supported versions before changing data. A confirmation shows transaction/account/schedule counts and explicitly states that restore replaces current data. Versions 1–3 are accepted. Restoration keeps the device PIN and biometric settings; files larger than 25 MB are rejected. A failed restore rolls back in-memory data and local storage. If storage recovery also fails, the app asks you to export the recovered in-memory data before closing. Backups remain plain JSON; encryption is not included in this update.
