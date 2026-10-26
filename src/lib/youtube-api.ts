// Minimal typing and loader for the YouTube IFrame Player API (https://www.youtube.com/iframe_api).
// Used only to learn whether a video is playing, so listening time can be measured. If the script cannot load, the video
// still plays in its normal iframe; the time is simply not measured.

export type YTPlayer = {
  getPlayerState(): number;
  isMuted(): boolean;
  getVolume(): number;
};

type YTNamespace = {
  Player: new (
    element: HTMLIFrameElement,
    options: { events?: { onReady?: () => void; onStateChange?: (event: { data: number }) => void } },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState.PLAYING */
export const YT_PLAYING = 1;

let pending: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else {
        pending = null;
        reject(new Error('YouTube API did not initialise'));
      }
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      pending = null;
      reject(new Error('YouTube API failed to load'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
