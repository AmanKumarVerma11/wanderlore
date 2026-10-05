import { describe, it, expect } from "vitest";
import { safeHttpsUrl } from "./safe-url";

describe("safeHttpsUrl", () => {
  it("accepts the https hosts the server produces", () => {
    for (const u of [
      "https://www.openstreetmap.org/node/123",
      "https://en.wikipedia.org/wiki/Kyoto",
      "https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg",
    ]) {
      expect(safeHttpsUrl(u)).toBe(u);
    }
  });

  it("rejects script and data URLs, including obfuscated ones", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(safeHttpsUrl(u)).toBeNull();
    }
  });

  it("rejects plain http and other hosts, including lookalikes", () => {
    for (const u of [
      "http://www.openstreetmap.org/node/1",
      "https://evil.example/x",
      "https://openstreetmap.org.evil.example/x",
      "https://evilopenstreetmap.org/x",
      "https://evil.example\\@openstreetmap.org/x",
    ]) {
      expect(safeHttpsUrl(u)).toBeNull();
    }
  });

  it("rejects non-strings and malformed input", () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(42)).toBeNull();
    expect(safeHttpsUrl("not a url")).toBeNull();
  });
});
