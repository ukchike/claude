package com.financeflow.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Watches incoming notifications for bank debit/credit alerts (amount + currency pattern)
 * and stores matches locally for the user to review and confirm inside the app. Nothing is
 * transmitted off-device — everything lives in this app's own SharedPreferences.
 */
public class BankAlertListenerService extends NotificationListenerService {

    static final String PREFS = "bank_alerts";
    static final String KEY_PENDING = "pending";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_SEEN = "seen_keys";
    private static final int MAX_PENDING = 30;
    private static final int MAX_SEEN = 200;

    // ₦12,345.67 / NGN12,345.67 — common Nigerian bank alert amount formats. Deliberately
    // requires an explicit currency marker (no bare "N" — that alternative used to match
    // unrelated things like "N5G" network notifications or "6.52° N" coordinates).
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:NGN|₦)\\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})?)",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern CREDIT_PATTERN = Pattern.compile(
        "credited|received|deposit|credit alert|inflow", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEBIT_PATTERN = Pattern.compile(
        "debited|debit alert|purchase|withdrawn|withdrawal|sent to|outflow|paid",
        Pattern.CASE_INSENSITIVE);
    // A currency symbol alone isn't enough to know this is a real bank alert (some apps show
    // prices, unrelated promos, etc). Require one of these banking-context words too.
    private static final Pattern MONEY_CONTEXT_PATTERN = Pattern.compile(
        "credited|debited|credit alert|debit alert|transaction|transfer|withdrawal|withdrawn|" +
        "deposit|balance|acct|account|purchase|payment|received|sent to|paid to|pos|atm|inflow|outflow",
        Pattern.CASE_INSENSITIVE);

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null || pkg.equals(getPackageName())) return; // ignore our own notifications

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;

        Notification n = sbn.getNotification();
        if (n == null || n.extras == null) return;
        Bundle extras = n.extras;
        String title = safeString(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = safeString(extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = safeString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        String combined = (title + " " + text + " " + bigText).trim();
        if (combined.isEmpty()) return;

        Matcher amountMatcher = AMOUNT_PATTERN.matcher(combined);
        if (!amountMatcher.find()) return; // no ₦/NGN amount at all
        if (!MONEY_CONTEXT_PATTERN.matcher(combined).find()) return; // no banking-alert wording — skip

        String rawAmount = amountMatcher.group(1);
        if (rawAmount == null) return;
        double amount;
        try {
            amount = Double.parseDouble(rawAmount.replace(",", ""));
        } catch (NumberFormatException e) {
            return;
        }
        if (amount <= 0) return;

        String type = CREDIT_PATTERN.matcher(combined).find() ? "income"
            : DEBIT_PATTERN.matcher(combined).find() ? "expense"
            : "expense"; // most bank push alerts are debits; default when keyword is ambiguous

        String dedupeKey = pkg + "|" + combined.hashCode();
        String seenJoined = prefs.getString(KEY_SEEN, "");
        if (seenJoined.contains(dedupeKey)) return;

        try {
            JSONArray pending = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            JSONObject entry = new JSONObject();
            entry.put("id", sbn.getKey() != null ? sbn.getKey() : (pkg + "_" + sbn.getPostTime()));
            entry.put("amount", amount);
            entry.put("type", type);
            entry.put("text", combined.length() > 140 ? combined.substring(0, 140) : combined);
            entry.put("timestamp", sbn.getPostTime());

            JSONArray trimmed = new JSONArray();
            trimmed.put(entry);
            for (int i = 0; i < pending.length() && trimmed.length() < MAX_PENDING; i++) {
                trimmed.put(pending.get(i));
            }

            String[] seenArr = seenJoined.isEmpty() ? new String[0] : seenJoined.split("\n");
            StringBuilder seenBuilder = new StringBuilder(dedupeKey);
            int keep = Math.min(seenArr.length, MAX_SEEN - 1);
            for (int i = 0; i < keep; i++) {
                seenBuilder.append("\n").append(seenArr[i]);
            }

            prefs.edit()
                .putString(KEY_PENDING, trimmed.toString())
                .putString(KEY_SEEN, seenBuilder.toString())
                .apply();
        } catch (Exception ignored) {
            // malformed prefs content — drop this detection rather than crash the listener
        }
    }

    private static String safeString(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
