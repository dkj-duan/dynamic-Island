import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IslandPeekWindow } from "./features/island/IslandPeekWindow";
import { IslandWindow } from "./features/island/IslandWindow";
import { watchDisplayTier } from "./services/display";

// Applies <html data-large-display> now and on resolution or DPI changes.
watchDisplayTier();

const surface = new URLSearchParams(window.location.search).get("window");
if (surface === "island" || surface === "peek") {
  document.documentElement.classList.add("island-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {surface === "peek" ? (
      <IslandPeekWindow />
    ) : surface === "island" ? (
      <IslandWindow />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
