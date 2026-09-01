package com.financeflow.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Home-screen widget showing the balance/budget summary last synced from the app (JS calls
 * syncWidgetData() on every save() — see MainActivity). The widget itself has no way to run the
 * WebView in the background, so this is always "as of the last time the app was open", not live.
 */
public class BalanceWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "widget_data";
    static final String KEY_BALANCE = "balance_text";
    static final String KEY_BUDGET = "budget_text";
    static final String KEY_INCOME = "income_text";
    static final String KEY_EXPENSE = "expense_text";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
    }

    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, BalanceWidgetProvider.class));
        for (int id : ids) updateWidget(context, mgr, id);
    }

    private static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String balance = prefs.getString(KEY_BALANCE, "—");
        String budget = prefs.getString(KEY_BUDGET, "Open FinanceFlow to sync");
        String income = prefs.getString(KEY_INCOME, "In —");
        String expense = prefs.getString(KEY_EXPENSE, "Out —");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance);
        views.setTextViewText(R.id.widget_balance, balance);
        views.setTextViewText(R.id.widget_budget, budget);
        views.setTextViewText(R.id.widget_income, income);
        views.setTextViewText(R.id.widget_expense, expense);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPI = PendingIntent.getActivity(context, widgetId, openIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_title, openPI);
        views.setOnClickPendingIntent(R.id.widget_balance, openPI);
        views.setOnClickPendingIntent(R.id.widget_budget, openPI);

        Intent addIntent = new Intent(context, MainActivity.class);
        addIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        addIntent.putExtra(MainActivity.EXTRA_SHORTCUT_ACTION, "addtx");
        // Distinct request code ranges (widgetId + 100000 / + 200000) so these PendingIntents
        // never collide with the "open" one, or each other, for the same widget instance.
        PendingIntent addPI = PendingIntent.getActivity(context, widgetId + 100000, addIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_add_btn, addPI);

        Intent budgetsIntent = new Intent(context, MainActivity.class);
        budgetsIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        budgetsIntent.putExtra(MainActivity.EXTRA_SHORTCUT_ACTION, "budgets");
        PendingIntent budgetsPI = PendingIntent.getActivity(context, widgetId + 200000, budgetsIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_budgets_btn, budgetsPI);

        mgr.updateAppWidget(widgetId, views);
    }
}
