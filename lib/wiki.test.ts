import { describe, it, expect, vi, afterEach } from "vitest";
import { commonsFileName, imageCredit } from "./wiki";
import { clearMemoryCache } from "./cache";

const THUMB =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/330px-Lisboa_-_Portugal_%2852597836992%29.jpg?utm_source=en.wikipedia.org";

describe("commonsFileName", () => {
  it("reads the file name from thumbnail and original Commons URLs", () => {
    expect(commonsFileName(THUMB)).toBe("Lisboa_-_Portugal_(52597836992).jpg");
    expect(
      commonsFileName("https://upload.wikimedia.org/wikipedia/commons/a/ab/Kyoto.jpg")
    ).toBe("Kyoto.jpg");
  });

  it("returns null for non-Commons files and other hosts", () => {
    expect(commonsFileName("https://upload.wikimedia.org/wikipedia/en/a/ab/Logo.png")).toBeNull();
    expect(commonsFileName("https://evil.example/wikipedia/commons/a/ab/x.jpg")).toBeNull();
    expect(commonsFileName("not a url")).toBeNull();
  });
});

describe("imageCredit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache(); // credits are cached; each test needs a fresh lookup
  });

  const commonsReply = (extmetadata: object) =>
    vi.fn(async () => Response.json({ query: { pages: [{ imageinfo: [{ extmetadata }] }] } }));

  it("returns the author as plain text with the licence", async () => {
    vi.stubGlobal(
      "fetch",
      commonsReply({
        Artist: { value: '<a href="https://www.flickr.com/people/x">Vitor Oliveira</a> from Torres Vedras' },
        LicenseShortName: { value: "CC BY-SA 2.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/2.0" },
      })
    );
    expect(await imageCredit(THUMB)).toEqual({
      artist: "Vitor Oliveira from Torres Vedras",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      fileUrl: "https://commons.wikimedia.org/wiki/File:Lisboa_-_Portugal_(52597836992).jpg",
    });
  });

  it("keeps just the name when Commons only assumed the author", async () => {
    vi.stubGlobal(
      "fetch",
      commonsReply({
        Artist: { value: "No machine-readable author provided. <a href=\"//commons.wikimedia.org/wiki/User:J\">João Sousa</a> assumed (based on copyright claims)." },
        LicenseShortName: { value: "CC BY-SA 3.0" },
      })
    );
    expect((await imageCredit(THUMB))?.artist).toBe("João Sousa");
  });

  it("returns null when the licence is unknown, so the photo is dropped", async () => {
    vi.stubGlobal("fetch", commonsReply({ Artist: { value: "Someone" } }));
    expect(await imageCredit(THUMB)).toBeNull();
  });

  it("does not call the API for non-Commons images", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await imageCredit("https://upload.wikimedia.org/wikipedia/en/a/ab/Logo.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
