import { useCallback, useEffect, useState } from 'react'

/** Read-aloud with the browser's built-in speech synthesis (never a paid voice service). `available`
 * is false when the browser has no voice for the language, so the button can stay hidden. */
export function useSpeech(language: string) {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth?.getVoices() ?? [])
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!synth) return undefined
    const update = () => setVoices(synth.getVoices())
    update()
    synth.addEventListener?.('voiceschanged', update)
    return () => synth.removeEventListener?.('voiceschanged', update)
  }, [synth])

  const prefix = language.toLowerCase().split('-')[0]
  const available = voices.some((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === prefix)

  const stop = useCallback(() => {
    synth?.cancel()
    setSpeaking(false)
  }, [synth])

  const speak = useCallback(
    (text: string) => {
      if (!synth) return
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language
      const voice = synth.getVoices().find((candidate) => candidate.lang.toLowerCase().split(/[-_]/)[0] === prefix)
      if (voice) utterance.voice = voice
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      setSpeaking(true)
      synth.speak(utterance)
    },
    [synth, language, prefix],
  )

  useEffect(() => () => synth?.cancel(), [synth])

  return { available, speaking, speak, stop }
}
