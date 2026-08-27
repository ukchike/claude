package com.financeflow.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Quick Settings tile for one-tap transaction entry — pull down the notification shade twice,
 * tap "Add Transaction", and land straight in the Add Transaction modal without navigating the
 * app first. Only exists on API 24+ (TileService itself requires it); inert everywhere else.
 */
public class QuickAddTileService extends TileService {
    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setLabel("Add Transaction");
            tile.setState(Tile.STATE_ACTIVE);
            tile.updateTile();
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(MainActivity.EXTRA_SHORTCUT_ACTION, "addtx");
        if (Build.VERSION.SDK_INT >= 34) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(this, 0, intent, flags);
            startActivityAndCollapse(pi);
        } else {
            // Deprecated on API 34+ in favour of the PendingIntent overload above, but this is
            // the only working path below it — still fully functional down to API 24.
            //noinspection deprecation
            startActivityAndCollapse(intent);
        }
    }
}
