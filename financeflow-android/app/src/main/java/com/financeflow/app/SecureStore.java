package com.financeflow.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** App-private encrypted records; key material remains in Android Keystore. */
public final class SecureStore {
    private static final String ALIAS="financeflow_records_v1";
    private final SharedPreferences prefs;
    public SecureStore(Context context){prefs=context.getSharedPreferences("encrypted_records",Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        if(!prefs.getAll().isEmpty())throw new IllegalStateException("Encryption key unavailable. Restore an exported backup.");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return generator.generateKey();
    }
    private static void check(String name){if(name==null||!name.startsWith("ffd_"))throw new IllegalArgumentException("Invalid record key");}
    public synchronized String get(String name){
        JSONObject result=new JSONObject();
        try{check(name);String stored=prefs.getString(name,null);result.put("found",stored!=null);
            if(stored!=null){String[] parts=stored.split(":",-1);if(parts.length!=2)throw new IllegalStateException("Invalid encrypted record");
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
                cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
                result.put("value",new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
            result.put("ok",true);
        }catch(Exception e){try{result.put("ok",false);result.put("error","Encrypted storage could not be read. Keep your exported backup available.");}catch(Exception ignored){}}
        return result.toString();
    }
    public synchronized boolean set(String name,String value){
        try{check(name);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            String stored=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            return prefs.edit().putString(name,stored).commit();
        }catch(Exception e){return false;}
    }
    public synchronized boolean remove(String name){try{check(name);return prefs.edit().remove(name).commit();}catch(Exception e){return false;}}
    public synchronized String keys(){return new JSONArray(prefs.getAll().keySet()).toString();}
}
