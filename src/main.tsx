import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Placeholder shell — the full panel port lands in a later milestone. The
// generation core and regression harness come first (output parity is the
// top priority), so this entry point stays intentionally minimal for now.
function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Sweatbox Builder v6</h1>
        <p className="text-xs text-slate-500 mt-1">
          Desktop port — UI panels arrive after the generation core + parity suite.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
