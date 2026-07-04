import { ImageResponse } from "next/og";

// Dynamically-generated social share image (1200×630) in Wanderlore's monochrome
// + red theme. File-based convention: Next wires this into og:image / twitter:image.
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#1a1a1a",
            fontSize: 28,
            letterSpacing: 6,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "4px solid #e5352b",
            }}
          />
          WANDERLORE
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 700,
              color: "#1a1a1a",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Discover a place&rsquo;s{" "}
            <span style={{ color: "#e5352b" }}>soul</span>,
          </div>
          <div
            style={{
              fontSize: 78,
              fontWeight: 700,
              color: "#1a1a1a",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            not just its sights.
          </div>
          <div style={{ fontSize: 30, color: "#6b6b6b", marginTop: 28 }}>
            AI cultural trips · hidden gems · heritage · every place verified on a
            real map
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#8a8a8a",
            letterSpacing: 1,
            fontFamily: "monospace",
          }}
        >
          wanderlore.amankrverma.in
        </div>
      </div>
    ),
    { ...size }
  );
}
