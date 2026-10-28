import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NativeMediaAction, NativeMediaState } from './native-media-state';

// The Android app's own plugin (native/android/.../MediaPlaybackPlugin.java): keeps music playing with the screen off and shows the
// notification and lock-screen controls. In a normal browser, and in any app build without the plugin, nothing here does anything.

interface MediaPlaybackPlugin {
  update(state: NativeMediaState): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'action', listener: (a: NativeMediaAction) => void): Promise<{ remove(): Promise<void> }>;
}

const plugin = registerPlugin<MediaPlaybackPlugin>('MediaPlayback');

export function nativeMediaAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MediaPlayback');
  } catch {
    return false;
  }
}

export const nativeMedia = {
  update(state: NativeMediaState): void {
    plugin.update(state).catch(() => {
      // The notification is a convenience; the music itself never depends on it.
    });
  },
  stop(): void {
    plugin.stop().catch(() => {});
  },
  onAction(listener: (a: NativeMediaAction) => void): Promise<{ remove(): Promise<void> }> {
    return plugin.addListener('action', listener);
  },
};
