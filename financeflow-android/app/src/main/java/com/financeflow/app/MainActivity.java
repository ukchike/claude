package com.financeflow.app;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String CHANNEL_ID = "financeflow_alerts";
    private int notifId = 1;

    // ── Lock-on-resume ──
    // Without this, the PIN/biometric lock only ever ran once at cold start (a single JS line
    // at the bottom of index.html), so backgrounding the app with Home and reopening it from
    // the app switcher skipped the lock screen entirely — anyone with the phone unlocked could
    // reopen FinanceFlow straight to the transaction list. onPause/onResume close that gap.
    //
    // suppressNextLock guards the false positives: the file chooser, the SAF save dialog, the
    // notification-listener/battery/app-details settings screens and external links (About)
    // all launch a separate Activity, which pauses MainActivity exactly like leaving the app
    // does. Every call site that launches one of those sets this flag first so returning from
    // them doesn't re-trigger the lock.
    private boolean suppressNextLock = false;
    private boolean awaitingLockCheck = false;

    // Web <input type=file> support (CSV/JSON upload, Google Drive included via document providers)
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    // Native "Save As" (SAF) support for backups — lets the user pick Drive, Downloads, etc.
    private ActivityResultLauncher<Intent> createDocumentLauncher;
    private String pendingSaveContent;
    private String pendingSaveCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);

        createNotificationChannel();
        requestNotificationPermissionInternal();
        registerLaunchers();

        webView = findViewById(R.id.webview);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            // The base WebChromeClient silently swallows JS alert()/confirm() dialogs —
            // without these overrides, every validation alert and delete confirmation in
            // the app does nothing when tapped.
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.confirm())
                    .setCancelable(false)
                    .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .setCancelable(true)
                    .show();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                              FileChooserParams params) {
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] acceptTypes = params.getAcceptTypes();
                if (acceptTypes != null && acceptTypes.length > 0 && !TextUtils.isEmpty(acceptTypes[0])) {
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
                }
                try {
                    suppressNextLock = true;
                    fileChooserLauncher.launch(Intent.createChooser(intent, "Select File"));
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void registerLaunchers() {
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null
                        && result.getData().getData() != null) {
                    results = new Uri[]{result.getData().getData()};
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

        createDocumentLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                boolean success = false;
                if (result.getResultCode() == RESULT_OK && result.getData() != null
                        && result.getData().getData() != null && pendingSaveContent != null) {
                    Uri uri = result.getData().getData();
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(pendingSaveContent.getBytes(StandardCharsets.UTF_8));
                            success = true;
                        }
                    } catch (IOException e) {
                        success = false;
                    }
                }
                pendingSaveContent = null;
                final boolean ok = success;
                final String cb = pendingSaveCallback;
                pendingSaveCallback = null;
                if (cb != null) {
                    webView.evaluateJavascript("window['" + cb + "'](" + ok + ")", null);
                }
            });
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Budget Alerts", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("FinanceFlow budget and spending alerts");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void requestNotificationPermissionInternal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
        }
    }

    private class AndroidBridge {

        @JavascriptInterface
        public boolean hasBiometric() {
            BiometricManager bm = BiometricManager.from(MainActivity.this);
            int result = bm.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_WEAK |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            return result == BiometricManager.BIOMETRIC_SUCCESS;
        }

        @JavascriptInterface
        public void authenticate(final String callbackFn) {
            BiometricManager bm = BiometricManager.from(MainActivity.this);
            int canAuth = bm.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_WEAK |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL);

            if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
                // No biometric/PIN available — unlock automatically
                runOnUiThread(() ->
                    webView.evaluateJavascript("window['" + callbackFn + "'](true)", null));
                return;
            }

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock FinanceFlow")
                .setSubtitle("Verify your identity to access your finances")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_WEAK |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                .build();

            runOnUiThread(() -> {
                BiometricPrompt prompt = new BiometricPrompt(MainActivity.this,
                    ContextCompat.getMainExecutor(MainActivity.this),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(
                                @NonNull BiometricPrompt.AuthenticationResult result) {
                            webView.evaluateJavascript(
                                "window['" + callbackFn + "'](true)", null);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode,
                                @NonNull CharSequence errString) {
                            webView.evaluateJavascript(
                                "window['" + callbackFn + "'](false)", null);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // prompt stays open for retry — do nothing
                        }
                    });
                prompt.authenticate(promptInfo);
            });
        }

        @JavascriptInterface
        public void showNotification(final String title, final String body) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(MainActivity.this,
                        android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            NotificationCompat.Builder builder =
                new NotificationCompat.Builder(MainActivity.this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true);
            NotificationManagerCompat.from(MainActivity.this)
                .notify(notifId++, builder.build());
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            return NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestNotificationPermissionInternal);
        }

        // Opens the system "Save As" dialog (Storage Access Framework) so the user can
        // pick any destination the device exposes — device storage, Downloads, or a
        // cloud provider such as Google Drive if that app is installed. No storage
        // permission is required since writes go through the returned content Uri.
        @JavascriptInterface
        public void saveFile(final String filename, final String content,
                              final String mimeType, final String callbackFn) {
            pendingSaveContent = content;
            pendingSaveCallback = callbackFn;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(!TextUtils.isEmpty(mimeType) ? mimeType : "application/octet-stream");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            runOnUiThread(() -> {
                try {
                    suppressNextLock = true;
                    createDocumentLauncher.launch(intent);
                } catch (Exception e) {
                    pendingSaveContent = null;
                    pendingSaveCallback = null;
                    webView.evaluateJavascript("window['" + callbackFn + "'](false)", null);
                }
            });
        }

        // ── Bank alert auto-detection (NotificationListenerService) ──

        @JavascriptInterface
        public boolean hasNotificationListenerAccess() {
            return NotificationManagerCompat.getEnabledListenerPackages(MainActivity.this)
                .contains(getPackageName());
        }

        @JavascriptInterface
        public void openNotificationListenerSettings() {
            runOnUiThread(() -> {
                try {
                    suppressNextLock = true;
                    startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                } catch (Exception ignored) {
                }
            });
        }

        // Writes a base64 PNG (drawn on-device with <canvas>, no screenshot capture involved) to
        // the cache dir and hands it to the system share sheet via a content:// Uri from
        // FileProvider — never a raw file:// path, which most share targets now reject outright.
        @JavascriptInterface
        public void shareImage(final String base64Png, final String title) {
            runOnUiThread(() -> {
                try {
                    File dir = new File(getCacheDir(), "images");
                    if (!dir.exists()) dir.mkdirs();
                    File imgFile = new File(dir, "summary_" + System.currentTimeMillis() + ".png");
                    byte[] bytes = Base64.decode(base64Png, Base64.DEFAULT);
                    try (FileOutputStream fos = new FileOutputStream(imgFile)) {
                        fos.write(bytes);
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this,
                        getPackageName() + ".fileprovider", imgFile);
                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType("image/png");
                    shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    suppressNextLock = true;
                    startActivity(Intent.createChooser(shareIntent,
                        TextUtils.isEmpty(title) ? "Share" : title));
                } catch (Exception ignored) {
                }
            });
        }

        // Hands off to the system browser via an intent — this does NOT need the app's own
        // INTERNET permission (the browser app does its own networking, not this WebView).
        @JavascriptInterface
        public void openExternalLink(String url) {
            runOnUiThread(() -> {
                try {
                    suppressNextLock = true;
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void setBankAlertsEnabled(boolean enabled) {
            getSharedPreferences(BankAlertListenerService.PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(BankAlertListenerService.KEY_ENABLED, enabled).apply();
        }

        @JavascriptInterface
        public String getPendingBankAlerts() {
            return getSharedPreferences(BankAlertListenerService.PREFS, Context.MODE_PRIVATE)
                .getString(BankAlertListenerService.KEY_PENDING, "[]");
        }

        @JavascriptInterface
        public void clearBankAlert(String id) {
            SharedPreferences prefs = getSharedPreferences(BankAlertListenerService.PREFS, Context.MODE_PRIVATE);
            try {
                JSONArray pending = new JSONArray(prefs.getString(BankAlertListenerService.KEY_PENDING, "[]"));
                JSONArray kept = new JSONArray();
                for (int i = 0; i < pending.length(); i++) {
                    JSONObject entry = pending.getJSONObject(i);
                    if (!entry.optString("id").equals(id)) kept.put(entry);
                }
                prefs.edit().putString(BankAlertListenerService.KEY_PENDING, kept.toString()).apply();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String getFlavor() {
            return BuildConfig.FLAVOR;
        }

        @JavascriptInterface
        public void scheduleReminders() {
            getSharedPreferences(ReminderReceiver.PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(ReminderReceiver.KEY_ENABLED, true).apply();
            ReminderReceiver.scheduleAll(MainActivity.this);
        }

        @JavascriptInterface
        public void cancelReminders() {
            getSharedPreferences(ReminderReceiver.PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(ReminderReceiver.KEY_ENABLED, false).apply();
            ReminderReceiver.cancelAll(MainActivity.this);
        }

        @JavascriptInterface
        public void syncUpcomingBills(String json) {
            getSharedPreferences(ReminderReceiver.PREFS, Context.MODE_PRIVATE)
                .edit().putString(ReminderReceiver.KEY_UPCOMING_BILLS, json).apply();
        }

        /** Fires a reminder immediately so the user can confirm notifications actually arrive. */
        @JavascriptInterface
        public void testReminder() {
            ReminderReceiver.postNotification(MainActivity.this, 9009, "Test reminder",
                "Reminders are working. You'll get these at 6am and 6pm daily.");
        }

        /**
         * Diagnostics for the Reminders screen: whether notifications are allowed, whether the
         * OEM battery optimiser is likely to kill our alarms, when the next one is due, and
         * when one last actually fired.
         */
        @JavascriptInterface
        public String reminderStatus() {
            JSONObject o = new JSONObject();
            try {
                o.put("notifications", NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled());
                boolean unrestricted = true;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) unrestricted = pm.isIgnoringBatteryOptimizations(getPackageName());
                }
                o.put("batteryUnrestricted", unrestricted);
                o.put("nextMorning", ReminderReceiver.nextFireTime(false));
                o.put("nextEvening", ReminderReceiver.nextFireTime(true));
                o.put("lastFired", getSharedPreferences(ReminderReceiver.PREFS, Context.MODE_PRIVATE)
                    .getLong(ReminderReceiver.KEY_LAST_FIRED, 0));
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        /**
         * Opens the system battery-optimisation list so the user can mark FinanceFlow as
         * unrestricted. Uses the settings-list intent rather than the direct-request one so no
         * extra (Play-Protect-flagged) permission has to be declared.
         */
        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> {
                try {
                    suppressNextLock = true;
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception e) {
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        suppressNextLock = true;
                        startActivity(i);
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /** Opens this app's system notification settings (per-channel mute lives here). */
        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    suppressNextLock = true;
                    startActivity(i);
                } catch (Exception e) {
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        suppressNextLock = true;
                        startActivity(i);
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (suppressNextLock) {
            // We're the ones navigating away (file picker, SAF save, a settings screen, an
            // external link) — don't count this as "left the app".
            suppressNextLock = false;
        } else {
            awaitingLockCheck = true;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (awaitingLockCheck) {
            awaitingLockCheck = false;
            // relock() is a JS function in index.html; it decides whether to actually show the
            // lock screen (only if a PIN or biometric lock is configured) and re-triggers
            // biometric auth. Guarded with typeof in case this fires before the page finishes
            // its first load.
            webView.evaluateJavascript("if(typeof relock==='function')relock();", null);
        }
    }
}
