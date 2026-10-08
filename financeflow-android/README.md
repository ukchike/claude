# FinanceFlow Android App

## Financial accuracy and recurring payments

- Income, spending, category statistics, budgets, calendars and widgets report in the primary currency. Each foreign account uses its manually entered conversion rate. Accounts without a rate are excluded and identified on financial screens. Current rates also apply to historical reports; historical FX accounting is not implemented.
- Individual entries show their account currency. CSV exports include a currency column.
- Transfers use two existing accounts. Cross-currency transfers require an explicit destination-units-per-source-unit rate, retain the sending and receiving amounts, and round each to cents. Account reporting rates remain separate. Existing incomplete cross-currency transfers are flagged for review.
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
6. If you use foreign accounts, set a manual rate and check converted report totals. Verify a missing-rate warning and try a small cross-currency transfer with an explicit rate.
7. Export and restore a backup on a separate test installation to check pending occurrences.

## Statement imports and bank-alert review

Statement uploads support CSV, TSV and semicolon-delimited text, including quoted commas, escaped quotes and multiline descriptions. The APK also extracts XLSX worksheets and text-based PDF tables offline. XLSX dates and sparse cells are supported. PDF layouts vary: check column alignment before importing. Scanned PDFs need OCR, and legacy XLS files must be converted to XLSX.

1. Select the target account and upload a statement (up to 4 MB / 10,000 rows).
2. Check the detected header row and map the date, description and amount/direction columns. Choose day-first or month-first numeric dates.
3. Debit/Credit columns determine direction. Amount-only statements require a Type column or an explicit positive/negative convention. Category suggestions never change debit/credit direction.
4. Review all rows and selected inflow/outflow totals. Invalid/summary rows are unselected. Existing matches are unselected by default; individually include a flagged row only if it is a separate genuine transaction.
5. Confirm the selected entries. The import can be undone immediately; recent batches appear under Backup & Restore and are included in JSON backups.

Duplicate detection compares account, date, direction, amount and reference/description. Matches against manual entries, bank alerts, transfers and split totals receive review flags. This is a review aid: missing references, changed dates and different descriptions can prevent an exact match.

The Full APK detects NGN, USD, EUR and GBP bank-alert candidates locally. Both comma-formatted and uncommaed amounts are supported. Balance-labelled amounts are excluded; multiple candidate amounts and ambiguous directions need review. The source app and notification text are visible, and unwanted sources can be ignored and subsequently allowed again.

Bank-alert confirmation requires selecting an account in the detected currency; unknown direction requires an explicit Income/Expense choice. The date defaults to the notification date and must be checked. Existing matching amounts/records trigger an additional warning. Alerts remain unreconciled until you verify them against your bank statement. Notifications are never posted automatically. Detection is format-dependent; anonymised real-bank examples are needed for bank-specific acceptance testing.

GitHub Actions also compiles and runs the pure Java BankAlertParserTest before building the APKs.

### Description-based import categories

Statement review suggests category and subcategory from specific description phrases, or an unambiguous previous classification of the same description (reference IDs are ignored). Existing custom categories are supported through previous classifications. Generic POS, transfer or payment wording, conflicting history, and multiple rule matches fall back to Other for review. Suggestions never change debit/credit direction. Each row has editable category/subcategory selectors before confirmation; confirmed corrections inform later matching descriptions. No external AI service is used.

### Backup restore safeguards

JSON restore validates record shapes, financial amounts/dates, account references, duplicate IDs and supported versions before changing data. A confirmation shows transaction/account/schedule counts and explicitly states that restore replaces current data. Versions 1–3 are accepted. Restoration keeps the device PIN and biometric settings; files larger than 25 MB are rejected. A failed restore rolls back in-memory data and local storage. If storage recovery also fails, the app asks you to export the recovered in-memory data before closing. Both plain JSON and password-protected encrypted backups are supported.

### Account history and dashboard accessibility

Accounts with recorded transactions, either transfer endpoint, recurring schedules (including paused schedules), any recurring-payment history or statement-import history cannot be deleted. Empty-account deletion requires confirmation; at least one account must remain.

Small text and touch targets are larger, pinch zoom is enabled, keyboard focus is visible and reduced-motion preferences are respected. Navigation exposes the current page and labelled actions. New installations put balance, accounts, period totals, budgets and recent transactions first, with extra trend charts hidden. Existing saved layouts are preserved. Home → Rearrange → Restore recommended Home layout applies the new defaults.

### Lock and privacy safeguards

Unavailable native authentication fails closed. Existing SHA-256 PINs migrate to salted PBKDF2-SHA256 (100,000 iterations) on successful unlock. Five incorrect PIN entries start a persistent cooldown; changing/removing an existing PIN requires that PIN. Screenshots and recent-app previews are protected with FLAG_SECURE. The widget hides financial figures while an app lock is configured. The WebView blocks navigation to untrusted pages and cross-file/universal file access; ordinary web links open externally. Android automatic backup/device transfer excludes app data; explicit JSON export/restore remains available.

These controls supplement record/backup encryption; they do not replace Android device security or rotate the existing signing key. Signing identity is unchanged to support updates over installed APKs.

### Encrypted financial records and backups

On Android 6+ the app uses AES-256-GCM encrypted app-private records with an Android Keystore key. Existing ffd_ localStorage records migrate on startup; every encrypted record is verified before legacy copies are removed. A read/write failure stops startup rather than replacing records. Android versions below 6 keep the previous storage. Financial WebView state and the native pending bank-alert cache are encrypted on Android 6+. Alert text and seen-notification identifiers migrate into a verified authenticated record; permission/ignored-source preferences do not contain financial amounts.

Settings → Backup & Restore → Encrypted backup exports AES-256-GCM data using a separate password (minimum 10 characters), random 16-byte salt, random 12-byte IV and PBKDF2-SHA256 with 200,000 iterations. Restore accepts both encrypted backups and older plain JSON. The password cannot be recovered. Device keys are not exported; JSON backup contains no PIN or biometric credentials. Keep an exported backup before upgrading and store its password separately. Existing signing identity is unchanged; repository signing credentials still need migration to GitHub Actions secrets through repository administration.


## Compact transaction entry

Tags are removed from Add/Edit entry forms (existing tags are retained). Essential fields are arranged in two columns; receipt and recurring/reconciliation options are collapsed. Save remains outside the scrollable body, including split entries and transfer forms. Browser checks cover 320, 360 and 412 px widths; the on-device keyboard and bank layouts still require acceptance testing.

## Reconciliation and matching

Settings → Accounts → Reconcile account compares the closing statement balance with checked entries as of a closing date. It records a completed reconciliation only at zero difference; it creates no balancing entries. Opening balances must already be present in the ledger. Transfer endpoints reconcile independently in their own currencies. Statement review can explicitly match a flagged row to an existing entry, mark that account's entry reconciled and remember the match for repeat imports without posting another transaction.

## Reusable classification rules

Settings → Statement category rules maps a description phrase to an Income/Expense category and optional subcategory. Rules use word boundaries, support custom categories and are included in encrypted/plain backups. Conflicting rules stay subject to review.

## Private signing preparation — owner action required

The build accepts these repository Actions secrets: FF_SIGNING_KEYSTORE_BASE64, FF_SIGNING_STORE_PASSWORD, FF_SIGNING_KEY_ALIAS, FF_SIGNING_KEY_PASSWORD. In GitHub → repository Settings → Secrets and variables → Actions, add the original release keystore encoded as one-line Base64 and its existing credentials. Never paste these values into chat or commit them. Use the same signing identity to preserve installed-app updates. Once configured and a signed build is verified, the legacy tracked keystore/credentials can be removed in a follow-up commit. This connection cannot create repository secrets, and existing exposed Git history is not erased by adding secrets. Production key rotation requires a separate Android signing-lineage/distribution plan. Release builds now use the workflow run number as Android versionCode and 1.2.<run> as versionName.
