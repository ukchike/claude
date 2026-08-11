package com.financeflow.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Re-arms the daily reminder alarms after a reboot, since AlarmManager alarms don't survive one. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences(ReminderReceiver.PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(ReminderReceiver.KEY_ENABLED, false)) {
            ReminderReceiver.scheduleAll(context);
        }
    }
}
