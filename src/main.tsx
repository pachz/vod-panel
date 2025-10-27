import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import App from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not defined. Check your environment variables.");
}

const convex = new ConvexReactClient(convexUrl);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html has an element with id=\"root\".");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
