import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IslandWindow } from "./features/island/IslandWindow";
import { watchDisplayTier } from "./services/display";

// Applies <html data-large-display> now and on resolution or DPI changes.
watchDisplayTier();

const isIsland =
  new URLSearchParams(window.location.search).get("window") === "island";
if (isIsland) document.documentElement.classList.add("island-window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isIsland ? <IslandWindow /> : <App />}</React.StrictMode>,
);
