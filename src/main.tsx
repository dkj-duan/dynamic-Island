import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IslandWindow } from "./features/island/IslandWindow";

// Screen dimensions are in CSS pixels, so Windows display scaling is already
// accounted for. Re-evaluate when the window moves between monitors.
function updateDisplayDensity() {
  document.documentElement.dataset.largeDisplay = String(
    window.screen.width >= 2304,
  );
}
updateDisplayDensity();
window.addEventListener("resize", updateDisplayDensity);

const isIsland =
  new URLSearchParams(window.location.search).get("window") === "island";
if (isIsland) document.documentElement.classList.add("island-window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isIsland ? <IslandWindow /> : <App />}</React.StrictMode>,
);
