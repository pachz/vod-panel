import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

import App from "./App";
import "./index.css";

const convexUrl = (
  import.meta as ImportMeta & {
    readonly env?: {
      readonly VITE_CONVEX_URL?: string;
    };
  }
).env?.VITE_CONVEX_URL;

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
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexAuthProvider>
  </React.StrictMode>
);
