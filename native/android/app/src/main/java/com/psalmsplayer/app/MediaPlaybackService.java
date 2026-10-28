package com.psalmsplayer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Foreground service of type "mediaPlayback": it keeps the app alive while music plays with the screen off, owns the media session
 * (the lock-screen and notification controls) and shows the notification. It does not play any sound: the website does, in the
 * WebView. Button presses are passed to the website through MediaPlaybackPlugin.emit.
 */
public class MediaPlaybackService extends Service {

    static final String ACTION_UPDATE = "com.psalmsplayer.app.action.UPDATE";
    static final String ACTION_PLAY = "com.psalmsplayer.app.action.PLAY";
    static final String ACTION_PAUSE = "com.psalmsplayer.app.action.PAUSE";
    static final String ACTION_NEXT = "com.psalmsplayer.app.action.NEXT";
    static final String ACTION_PREVIOUS = "com.psalmsplayer.app.action.PREVIOUS";

    private static final String CHANNEL_ID = "now_playing";
    private static final int NOTIFICATION_ID = 4101;
    // A safety net: a wake lock that is never released would drain the battery, so it expires if the website stops reporting.
    private static final long WAKE_LOCK_MAX_MS = 4L * 60 * 60 * 1000;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean foreground = false;

    private String title = "";
    private String artist = "";
    private String album = "";
    private boolean playing = false;
    private long positionMs = 0;
    private long durationMs = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        session = new MediaSession(this, "PsalmsPlayer");
        session.setCallback(
            new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    MediaPlaybackPlugin.emit("play", -1);
                }

                @Override
                public void onPause() {
                    MediaPlaybackPlugin.emit("pause", -1);
                }

                @Override
                public void onStop() {
                    MediaPlaybackPlugin.emit("pause", -1);
                }

                @Override
                public void onSkipToNext() {
                    MediaPlaybackPlugin.emit("next", -1);
                }

                @Override
                public void onSkipToPrevious() {
                    MediaPlaybackPlugin.emit("previous", -1);
                }

                @Override
                public void onSeekTo(long pos) {
                    MediaPlaybackPlugin.emit("seek", pos / 1000.0);
                }
            }
        );
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_UPDATE.equals(action)) {
            title = orEmpty(intent.getStringExtra("title"));
            artist = orEmpty(intent.getStringExtra("artist"));
            album = orEmpty(intent.getStringExtra("album"));
            playing = intent.getBooleanExtra("playing", false);
            positionMs = intent.getLongExtra("positionMs", 0);
            durationMs = intent.getLongExtra("durationMs", 0);
            render();
        } else if (ACTION_PLAY.equals(action)) {
            MediaPlaybackPlugin.emit("play", -1);
        } else if (ACTION_PAUSE.equals(action)) {
            MediaPlaybackPlugin.emit("pause", -1);
        } else if (ACTION_NEXT.equals(action)) {
            MediaPlaybackPlugin.emit("next", -1);
        } else if (ACTION_PREVIOUS.equals(action)) {
            MediaPlaybackPlugin.emit("previous", -1);
        }
        if (!foreground) {
            // Started by something other than an update (a stale button): nothing to show, so do not linger.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** Swiping the app away from the recent apps list closes the WebView and with it the sound, so the service ends too. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        foreground = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Now playing", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows the song that is playing, with play, pause and skip buttons");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void render() {
        session.setMetadata(
            new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .build()
        );
        session.setPlaybackState(
            new PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY |
                    PlaybackState.ACTION_PAUSE |
                    PlaybackState.ACTION_PLAY_PAUSE |
                    PlaybackState.ACTION_SKIP_TO_NEXT |
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackState.ACTION_SEEK_TO
                )
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, positionMs, playing ? 1f : 0f)
                .build()
        );

        Notification notification = buildNotification();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } else {
            getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification);
        }

        if (playing) acquireWakeLock();
        else releaseWakeLock();
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(title.isEmpty() ? "PsalmsPlayer" : title)
            .setContentText(artist)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(action(android.R.drawable.ic_media_previous, "Previous", ACTION_PREVIOUS))
            .addAction(
                playing
                    ? action(android.R.drawable.ic_media_pause, "Pause", ACTION_PAUSE)
                    : action(android.R.drawable.ic_media_play, "Play", ACTION_PLAY)
            )
            .addAction(action(android.R.drawable.ic_media_next, "Next", ACTION_NEXT))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return b.build();
    }

    private Notification.Action action(int icon, String label, String action) {
        Intent intent = new Intent(this, MediaPlaybackService.class).setAction(action);
        PendingIntent pending = PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pending).build();
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = getSystemService(PowerManager.class);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "psalmsplayer:playback");
            wakeLock.setReferenceCounted(false);
        }
        // Renewing every update keeps the timeout a safety net only: while the website reports, the lock is held.
        wakeLock.acquire(WAKE_LOCK_MAX_MS);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }
}
