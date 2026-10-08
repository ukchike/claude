package com.financeflow.app;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONObject;
/** Alert text and notification identifiers share one authenticated encrypted record. */
public final class BankAlertStore {
    private static final String KEY="ffd_native_bank_cache";
    private static JSONObject read(Context c) throws Exception {
        SharedPreferences p=c.getSharedPreferences(BankAlertListenerService.PREFS,Context.MODE_PRIVATE);
        if(Build.VERSION.SDK_INT<23)return new JSONObject().put("pending",p.getString("pending","[]")).put("seen_keys",p.getString("seen_keys",""));
        SecureStore store=new SecureStore(c);JSONObject result=new JSONObject(store.get(KEY));if(!result.optBoolean("ok"))throw new IllegalStateException("Encrypted alerts unavailable");
        if(result.optBoolean("found")){JSONObject data=new JSONObject(result.getString("value"));if(p.contains("pending")||p.contains("seen_keys"))p.edit().remove("pending").remove("seen_keys").commit();return data;}
        JSONObject old=new JSONObject().put("pending",p.getString("pending","[]")).put("seen_keys",p.getString("seen_keys",""));
        if(!store.set(KEY,old.toString()))throw new IllegalStateException("Alert migration failed");
        JSONObject check=new JSONObject(store.get(KEY));if(!check.optBoolean("ok")||!old.toString().equals(check.optString("value")))throw new IllegalStateException("Alert verification failed");
        p.edit().remove("pending").remove("seen_keys").commit();return old;
    }
    public static String get(Context c,String key,String fallback) throws Exception {synchronized(BankAlertListenerService.LOCK){return read(c).optString(key,fallback);}}
    public static void put(Context c,String pending,String seen) throws Exception {synchronized(BankAlertListenerService.LOCK){JSONObject data=read(c);if(pending!=null)data.put("pending",pending);if(seen!=null)data.put("seen_keys",seen);
        if(Build.VERSION.SDK_INT>=23){if(!new SecureStore(c).set(KEY,data.toString()))throw new IllegalStateException("Encrypted alert save failed");}
        else c.getSharedPreferences(BankAlertListenerService.PREFS,Context.MODE_PRIVATE).edit().putString("pending",data.optString("pending","[]")).putString("seen_keys",data.optString("seen_keys","")).commit();}}
    private BankAlertStore(){}
}
