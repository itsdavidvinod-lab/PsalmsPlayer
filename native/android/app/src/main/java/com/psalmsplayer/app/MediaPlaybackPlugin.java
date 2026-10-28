package com.psalmsplayer.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The website's player lives in a WebView, which Android treats like any other part of the app: with the screen off it can be
 * stopped at any time. This plugin starts a foreground service while a song is loaded (so Android keeps the app alive) and hands the
 * song's title and state to a media session (so the notification and lock screen show the controls). The website keeps playing the
 * audio itself; the buttons on the notification come back here and are sent to the website as an "action" event.
 *
 * Web side: src/lib/native-media.ts and src/components/player/useNativeMedia.ts.
 */
@CapacitorPlugin(
    name = "MediaPlayback",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class MediaPlaybackPlugin extends Plugin {

    private static MediaPlaybackPlugin instance;
    private boolean askedForNotifications = false;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        stopService();
    }

    /** Called by the service when a button on the notification or the lock screen is pressed. seekTo is in seconds, or -1. */
    static void emit(String action, double seekTo) {
        MediaPlaybackPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (seekTo >= 0) data.put("seekTo", seekTo);
        plugin.notifyListeners("action", data);
    }

    @PluginMethod
    public void update(PluginCall call) {
        // Android 13 and newer need the person's permission before a notification shows. Ask once, the first time music plays;
        // the music and the service work either way, only the controls would be missing.
        if (
            Build.VERSION.SDK_INT >= 33 &&
            Boolean.TRUE.equals(call.getBoolean("playing", false)) &&
            !askedForNotifications &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            askedForNotifications = true;
            requestPermissionForAlias("notifications", call, "notificationsAnswered");
            return;
        }
        send(call);
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        send(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopService();
        call.resolve();
    }

    private void send(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, MediaPlaybackService.class);
        intent.setAction(MediaPlaybackService.ACTION_UPDATE);
        intent.putExtra("title", call.getString("title", ""));
        intent.putExtra("artist", call.getString("artist", ""));
        intent.putExtra("album", call.getString("album", ""));
        intent.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
        Double position = call.getDouble("position", 0.0);
        Double duration = call.getDouble("duration", 0.0);
        intent.putExtra("positionMs", (long) (Math.max(0.0, position == null ? 0.0 : position) * 1000));
        intent.putExtra("durationMs", (long) (Math.max(0.0, duration == null ? 0.0 : duration) * 1000));
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception e) {
            // Android refuses to start a foreground service from the background in some situations. The song keeps playing in the
            // website either way; the next update, once the app is in front again, starts the service.
            Logger.warn("MediaPlayback", "could not start the playback service: " + e.getMessage());
        }
        call.resolve();
    }

    private void stopService() {
        try {
            Context context = getContext();
            context.stopService(new Intent(context, MediaPlaybackService.class));
        } catch (Exception e) {
            Logger.warn("MediaPlayback", "could not stop the playback service: " + e.getMessage());
        }
    }
}
