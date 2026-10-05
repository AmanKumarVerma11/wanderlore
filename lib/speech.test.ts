import { describe, it, expect } from "vitest";
import { inOwnScript, languageName, pickVoice } from "./speech";

const voice = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

describe("pickVoice", () => {
  const voices = [
    voice("Google português do Brasil", "pt-BR", false),
    voice("Joana", "pt-PT", true),
    voice("Luciana", "pt-BR", true),
    voice("Google 日本語", "ja-JP", false),
    voice("Kyoko", "ja_JP", true),
  ];

  it("prefers the same region, then a voice on the device", () => {
    expect(pickVoice(voices, "pt-PT")?.name).toBe("Joana");
    expect(pickVoice(voices, "pt-BR")?.name).toBe("Luciana");
    expect(pickVoice(voices, "ja-JP")?.name).toBe("Kyoko"); // "ja_JP" is the same tag
  });

  it("falls back to another region of the same language", () => {
    expect(pickVoice([voice("Luciana", "pt-BR", true)], "pt-PT")?.name).toBe("Luciana");
    expect(pickVoice(voices, "ja")?.name).toBe("Kyoko");
  });

  it("picks the region over the device when it must choose", () => {
    const remoteSameRegion = voice("Remote PT", "pt-PT", false);
    expect(pickVoice([voice("Luciana", "pt-BR", true), remoteSameRegion], "pt-PT")).toBe(remoteSameRegion);
  });

  it("returns null when the device has no voice for the language", () => {
    expect(pickVoice(voices, "ka-GE")).toBeNull();
    expect(pickVoice([], "ja-JP")).toBeNull();
  });
});

describe("languageName", () => {
  it("names the language, not the region", () => {
    expect(languageName("ja-JP")).toBe("Japanese");
    expect(languageName("pt-PT")).toBe("Portuguese");
  });

  it("returns the tag when it isn't a valid language", () => {
    expect(languageName("not a tag")).toBe("not a tag");
  });
});

describe("inOwnScript", () => {
  it("accepts phrases in their language's usual script", () => {
    expect(inOwnScript("おおきに", "ja-JP")).toBe(true);
    expect(inOwnScript("안녕하세요", "ko-KR")).toBe(true);
    expect(inOwnScript("नमस्ते", "hi-IN")).toBe(true);
    expect(inOwnScript("¡Buenos días!", "es-MX")).toBe(true);
    expect(inOwnScript("Wi-Fiはありますか", "ja-JP")).toBe(true); // a loanword in Latin letters is fine
  });

  // Each of these came from a real plan in the M2.5 eval.
  it("rejects romanized or mixed text, another language's script, and invalid tags", () => {
    expect(inOwnScript("Namaskara", "kn-IN")).toBe(false);
    expect(inOwnScript("खamma ghani", "hi-IN")).toBe(false);
    expect(inOwnScript("नमस्ते", "kn-IN")).toBe(false);
    expect(inOwnScript("Olá", "not a tag")).toBe(false);
  });
});
