import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

type VideoDoc = Doc<"videos">;

const isVimeoPlayerUrl = (value: string): boolean =>
  /^https:\/\/player\.vimeo\.com\/video\/\d+/.test(value);

const mainStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "2.5rem 1.5rem 4rem",
  fontFamily:
    "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: "#0f172a",
  display: "grid",
  gap: "2rem",
};

const sectionStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  padding: "1.75rem",
  boxShadow: "0 24px 48px -24px rgba(15, 23, 42, 0.2)",
};

const panelStyle: CSSProperties = {
  ...sectionStyle,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const controlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const inputStyle: CSSProperties = {
  flex: "1 1 240px",
  padding: "0.75rem 1rem",
  borderRadius: "10px",
  border: "1px solid #cbd5f5",
  fontSize: "1rem",
  backgroundColor: "#fff",
};

const buttonStyle: CSSProperties = {
  flex: "none",
  padding: "0.75rem 1.5rem",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9rem",
  color: "#64748b",
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: "#b91c1c",
  fontWeight: 600,
};

const statusStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  listStyle: "none",
  padding: 0,
  margin: 0,
  fontFamily:
    "ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: "0.9rem",
  color: "#1e293b",
};

const listItemStyle: CSSProperties = {
  wordBreak: "break-word",
  padding: "0.65rem 0.75rem",
  borderRadius: "8px",
  backgroundColor: "rgba(148, 163, 184, 0.15)",
};

const vimeoWrapperStyle: CSSProperties = {
  width: "100%",
  maxWidth: "640px",
  margin: "0 auto",
  borderRadius: "12px",
  overflow: "hidden",
};

const iframeStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "360px",
  border: 0,
  borderRadius: "12px",
  background: "#0f172a",
};

const headingStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "1rem",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "2rem",
  fontWeight: 700,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
};

const VimeoEmbed = ({ url, title }: { url: string; title?: string }) => (
  <div style={vimeoWrapperStyle}>
    <iframe
      src={url}
      title={title ?? "Saved Vimeo video"}
      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      style={iframeStyle}
      allowFullScreen
    />
  </div>
);

const App = () => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const videos = useQuery(api.video.listVideos);
  const addVideo = useMutation(api.video.addVideo);

  const videoList = useMemo<VideoDoc[]>(() => videos ?? [], [videos]);
  const latestVideo = videoList[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setError("Please paste a Vimeo embed URL before saving.");
      return;
    }

    if (!isVimeoPlayerUrl(trimmed)) {
      setError("The URL should look like https://player.vimeo.com/video/123456789.");
      return;
    }

    try {
      await addVideo({ url: trimmed });
      setUrl("");
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError("Something went wrong while saving the video. Please try again.");
    }
  };

  return (
    <main style={mainStyle}>
      <section style={panelStyle}>
        <h1 style={titleStyle}>VOD Panel</h1>
        <p style={subtitleStyle}>
          Add a Vimeo embed URL to save it in Convex and preview the video instantly.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label htmlFor="videoUrl" style={{ fontWeight: 600 }}>
            Vimeo embed URL
          </label>
          <div style={controlsStyle}>
            <input
              id="videoUrl"
              name="videoUrl"
              type="url"
              inputMode="url"
              placeholder="https://player.vimeo.com/video/1130646892"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              style={inputStyle}
            />
            <button type="submit" style={buttonStyle}>
              Save link
            </button>
          </div>
          <p style={hintStyle}>
            Example embed code URLs look like the one above. Paste the full player URL.
          </p>
        </form>
        {error && <p style={errorStyle}>{error}</p>}
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Latest video</h2>
        {latestVideo ? (
          <VimeoEmbed url={latestVideo.url} title="Latest saved Vimeo video" />
        ) : videos === undefined ? (
          <p style={statusStyle}>Loading saved videos…</p>
        ) : (
          <p style={statusStyle}>No videos saved yet.</p>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Saved links</h2>
        {videoList.length === 0 ? (
          videos === undefined ? (
            <p style={statusStyle}>Loading…</p>
          ) : (
            <p style={statusStyle}>Nothing stored yet.</p>
          )
        ) : (
          <ul style={listStyle}>
            {videoList.map((video) => (
              <li key={video._id} style={listItemStyle}>
                {video.url}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};

export default App;
