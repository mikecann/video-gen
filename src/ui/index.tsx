import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const style = document.createElement("style");
style.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #31343a; border-radius: 3px; }
  select option { background: #1b1d21; }
`;
document.head.appendChild(style);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");
createRoot(rootEl).render(<App />);
