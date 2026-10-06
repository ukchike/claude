package com.financeflow.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;


/**
 * Watches incoming notifications for bank debit/credit alerts (amount + currency pattern)
 * and stores matches locally for the user to review and confirm inside the app. Nothing is
 * transmitted off-device — everything lives in this app's own SharedPreferences.
 */
public class BankAlertListenerService extends NotificationListenerService {

    static final Object LOCK = new Object();
    static final String KEY_IGNORED = "ignored_packages";
    static final String PREFS = "bank_alerts";
    static final String KEY_PENDING = "pending";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_SEEN = "seen_keys";
    private static final int MAX_PENDING = 100;
    private static final int MAX_SEEN = 200;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null || pkg.equals(getPackageName())) return; // ignore our own notifications

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        if (prefs.getStringSet(KEY_IGNORED, java.util.Collections.emptySet()).contains(pkg)) return;

        Notification n = sbn.getNotification();
        if (n == null || n.extras == null) return;
        Bundle extras = n.extras;
        String title = safeString(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = safeString(extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = safeString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        // Expanded text usually repeats EXTRA_TEXT: use the expanded form once.
        String combined = (title + " " + (bigText.isEmpty() ? text : bigText)).trim();
        BankAlertParser.Result parsed = BankAlertParser.parse(combined);
        if (parsed == null) return;
        // Notification identity distinguishes two genuine identical purchases. A repost of the
        // same notification/text is ignored; a new notification with identical text is retained.
        String notificationKey = sbn.getKey() != null ? sbn.getKey() : pkg;
        String dedupeKey = pkg + "|" + notificationKey + "|" + sbn.getPostTime() + "|" + combined.hashCode();
        synchronized (LOCK) {
            if (prefs.getStringSet(KEY_IGNORED, java.util.Collections.emptySet()).contains(pkg)) return;
            String seenJoined = prefs.getString(KEY_SEEN, "");
            for (String seen : seenJoined.split("\n")) if (seen.equals(dedupeKey)) return;

            try {
                JSONArray pending = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
                JSONObject entry = new JSONObject();
                entry.put("id", notificationKey + "_" + sbn.getPostTime() + "_" + combined.hashCode());
                entry.put("amount", parsed.amount);
                entry.put("currency", "NGN");
                entry.put("parserVersion", 2);
                entry.put("packageName", pkg);
                entry.put("reference", parsed.reference);
                entry.put("amountUncertain", parsed.amountUncertain);
                String label = pkg;
                try { label = getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)).toString(); } catch (Exception ignored) {}
                entry.put("appName", label);
                entry.put("type", parsed.type);
                entry.put("text", combined.length() > 2000 ? combined.substring(0, 2000) : combined);
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
    }

    private static String safeString(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
