/** Only one audio plays at a time across the app (Songs, Audio Lesson): when any <audio> starts,
 * every other one pauses. `play` doesn't bubble, so this listens in the capture phase. */
export function initSingleAudio(): void {
  document.addEventListener(
    'play',
    (event) => {
      const started = event.target
      if (!(started instanceof HTMLMediaElement)) return
      document.querySelectorAll('audio, video').forEach((element) => {
        if (element !== started && element instanceof HTMLMediaElement && !element.paused) element.pause()
      })
    },
    true,
  )
}
