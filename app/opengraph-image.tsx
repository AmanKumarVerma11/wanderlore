import { ImageResponse } from "next/og";

// Dynamically-generated social share image (1200×630) in Wanderlore's monochrome
// + red theme. File-based convention: Next wires this into og:image / twitter:image.
// Note: Satori (next/og) requires every element with >1 child to set display:flex,
// so all inline text is split into spans inside flex rows.
export const runtime = "edge";
export const alt = "Wanderlore — AI cultural trip planner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fdfdfd",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 34,
              border: "4px solid #e5352b",
              marginRight: 18,
            }}
          />
          <span
            style={{
              fontSize: 28,
              letterSpacing: 6,
              fontWeight: 600,
              color: "#1a1a1a",
            }}
          >
            WANDERLORE
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 76,
                fontWeight: 700,
                color: "#1a1a1a",
                letterSpacing: -2,
                marginRight: 24,
              }}
            >
              Discover a place&#39;s
            </span>
            <span
              style={{
                fontSize: 76,
                fontWeight: 700,
                color: "#e5352b",
                letterSpacing: -2,
              }}
            >
              soul,
            </span>
          </div>
          <span
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: "#1a1a1a",
              letterSpacing: -2,
            }}
          >
            not just its sights.
          </span>
          <span style={{ fontSize: 29, color: "#6b6b6b", marginTop: 30 }}>
            AI cultural trips / hidden gems / heritage / every place verified on a
            real map
          </span>
        </div>

        <span
          style={{
            fontSize: 24,
            color: "#8a8a8a",
            letterSpacing: 1,
            fontFamily: "monospace",
          }}
        >
          wanderlore.amankrverma.in
        </span>
      </div>
    ),
    { ...size }
  );
}
