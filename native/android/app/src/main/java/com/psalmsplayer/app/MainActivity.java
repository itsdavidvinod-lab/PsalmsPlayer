package com.psalmsplayer.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The plugin that keeps music playing with the screen off and shows the lock-screen controls (see MediaPlaybackService).
        registerPlugin(MediaPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
