"use client";

import { useEffect, useState } from "react";
import { languageName, pickVoice } from "@/lib/speech";
import { Volume } from "./icons";

// Hear a phrase, at normal speed or slowed down to practise, with the browser's
// own speech synthesis: no server and no third-party request from this page.
// An on-device voice is preferred, so the text usually stays on the device.

const SLOW_RATE = 0.6;

/** The device's voices; null when this browser can't speak at all. */
function useVoices(): SpeechSynthesisVoice[] | null {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load(); // Chrome fills the list later and fires voiceschanged
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel(); // stop speaking when the plan goes away
    };
  }, []);
  return voices;
}

const button =
  "inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-paper/70 px-4 text-sm font-medium text-paper transition hover:bg-paper hover:text-ink";

export default function PhraseAudio({ text, lang }: { text: string; lang: string }) {
  const voices = useVoices();
  if (!voices || voices.length === 0) return null; // can't speak, or still loading
  const found = pickVoice(voices, lang);
  const name = languageName(lang);
  if (!found) {
    return (
      <p className="mt-4 text-xs text-paper/80">
        No {name} voice on this device, so use the guide above.
      </p>
    );
  }
  const voice: SpeechSynthesisVoice = found;

  function speak(rate: number) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    synth.speak(u);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={() => speak(1)} aria-label={`Listen to ${text}, in ${name}`} className={button}>
        <Volume size={16} /> Listen
      </button>
      <button type="button" onClick={() => speak(SLOW_RATE)} aria-label={`Listen to ${text} slowly, in ${name}`} className={button}>
        <Volume size={16} /> Slowly
      </button>
    </div>
  );
}
