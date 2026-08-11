package com.financeflow.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Fires at 6am and 6pm daily (when reminders are enabled) to nudge the user to log
 * transactions, flag recurring bills due within the next few days, and — once a week —
 * remind them to back up their data. Reads everything it needs from SharedPreferences
 * (synced by MainActivity's JS bridge whenever data is saved) so it never has to spin
 * up the WebView just to check state.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "reminders";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_UPCOMING_BILLS = "upcoming_bills";
    private static final String ACTION_MORNING = "com.financeflow.app.REMIND_MORNING";
    private static final String ACTION_EVENING = "com.financeflow.app.REMIND_EVENING";
    private static final String CHANNEL_ID = "financeflow_alerts";
    private static final int REQ_MORNING = 4001;
    private static final int REQ_EVENING = 4002;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return; // reminders were turned off since this alarm was scheduled

        ensureChannel(context);
        boolean evening = ACTION_EVENING.equals(intent.getAction());

        postNotification(context, 9001,
            evening ? "Evening check-in" : "Morning check-in",
            "Log today's income & expenses in FinanceFlow.");

        if (evening) {
            postBillReminder(context, prefs);
            postWeeklyBackupReminder(context);
        }

        // These are one-shot alarms (setAndAllowWhileIdle) — reschedule the same slot 24h out.
        scheduleNext(context, evening, false);
    }

    private void postBillReminder(Context context, SharedPreferences prefs) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_UPCOMING_BILLS, "[]"));
            if (arr.length() == 0) return;
            StringBuilder body = new StringBuilder();
            for (int i = 0; i < arr.length() && i < 3; i++) {
                JSONObject o = arr.getJSONObject(i);
                if (body.length() > 0) body.append(", ");
                body.append(o.optString("desc", "Bill")).append(" (").append(o.optString("due", "")).append(")");
            }
            if (arr.length() > 3) body.append(" +").append(arr.length() - 3).append(" more");
            postNotification(context, 9002, "Bills due soon", body.toString());
        } catch (Exception ignored) {
        }
    }

    private void postWeeklyBackupReminder(Context context) {
        if (Calendar.getInstance().get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
            postNotification(context, 9003, "Backup reminder",
                "It's been a week — back up your FinanceFlow data to Google Drive or another cloud app.");
        }
    }

    private void postNotification(Context context, int id, String title, String body) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted — skip silently, same as other notification call sites.
        }
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Budget Alerts", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("FinanceFlow budget and spending alerts");
                nm.createNotificationChannel(channel);
            }
        }
    }

    static void scheduleAll(Context context) {
        scheduleNext(context, false, true);
        scheduleNext(context, true, true);
    }

    static void cancelAll(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(pendingIntentFor(context, false));
        am.cancel(pendingIntentFor(context, true));
    }

    private static void scheduleNext(Context context, boolean evening, boolean fromToday) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, evening ? 18 : 6);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (!fromToday || cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        // Inexact-but-Doze-aware alarm — avoids requesting the SCHEDULE_EXACT_ALARM permission
        // (Android 13+) for something that doesn't need to-the-minute precision.
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pendingIntentFor(context, evening));
        } catch (SecurityException ignored) {
        }
    }

    private static PendingIntent pendingIntentFor(Context context, boolean evening) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(evening ? ACTION_EVENING : ACTION_MORNING);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(context, evening ? REQ_EVENING : REQ_MORNING, intent, flags);
    }
}
