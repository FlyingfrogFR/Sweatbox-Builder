import React from "react";
import ReactDOM from "react-dom/client";

// IBM Plex, bundled locally so the desktop app renders correctly offline.
// Latin subset only — the app renders ASCII aviation data (ICAO codes,
// callsigns, routes); the full-subset imports shipped ~1.1 MB of unused
// cyrillic/greek/vietnamese font files in the installer.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";

import DeckApp from "./deck/DeckApp";
import "./index.css";
import "./deck/deck.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DeckApp />
  </React.StrictMode>,
);
