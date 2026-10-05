// Choosing a voice for a phrase, for the browser's own speech synthesis (free, no
// server, no CSP change). Pure, so it is tested without a browser;
// components/PhraseAudio.tsx does the speaking.

export interface VoiceLike {
  lang: string; // BCP 47, e.g. "ja-JP" (some browsers write "ja_JP")
  localService: boolean; // true: synthesised on the device, the text stays there
}

const tag = (s: string) => s.toLowerCase().replace(/_/g, "-");
const base = (s: string) => tag(s).split("-")[0];

/**
 * The best voice for a language: one for the same region first (the accent is the
 * point of practising), then any for the same language; and at the same match, a
 * voice on the device over one that sends the text to a remote service. Null when
 * the device has no voice for the language.
 */
export function pickVoice<V extends VoiceLike>(voices: V[], lang: string): V | null {
  let best: V | null = null;
  let bestScore = -1;
  for (const v of voices) {
    if (base(v.lang) !== base(lang)) continue;
    const score = (tag(v.lang) === tag(lang) ? 2 : 0) + (v.localService ? 1 : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

// Japanese and Korean mix scripts; other ISO 15924 codes are also Unicode script names.
const SCRIPT_SETS: Record<string, string[]> = { Jpan: ["Hani", "Hira", "Kana"], Kore: ["Hang", "Hani"], Hans: ["Hani"], Hant: ["Hani"] };

/**
 * Whether text is mostly in the script its language is usually written in. A voice
 * reads what is written, so romanized Hindi or a phrase in another language's script
 * would be read wrongly. Under half the letters may differ ("Wi-Fiはありますか").
 * False for an invalid tag; true when the usual script can't be told.
 */
export function inOwnScript(text: string, lang: string): boolean {
  let script: string | undefined;
  try {
    script = new Intl.Locale(lang).maximize().script;
  } catch {
    return false;
  }
  if (!script) return true;
  let inScript: RegExp;
  try {
    const sets = SCRIPT_SETS[script] ?? [script];
    inScript = new RegExp(`^(?:${sets.map((s) => `\\p{scx=${s}}`).join("|")})$`, "u");
  } catch {
    return true; // a script this engine can't match
  }
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  return letters.filter((c) => inScript.test(c)).length * 2 >= letters.length;
}

/** "ja-JP" -> "Japanese"; the tag itself when the browser can't name it. */
export function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(base(lang)) ?? lang;
  } catch {
    return lang; // not a valid tag
  }
}
