import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Silence the benign 'ResizeObserver loop completed with undelivered notifications' warning
// emitted by Radix UI's Select on open. CRA's dev-server-client-overlay otherwise surfaces it
// as a full-screen red error in the preview environment, blocking pointer events.
// Production builds don't have this overlay so this is a no-op there.
const RO_MSG = /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/;
window.addEventListener("error", (e) => {
  if (e?.message && RO_MSG.test(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (e?.reason?.message && RO_MSG.test(e.reason.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
