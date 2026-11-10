import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import App from "./App.tsx";
import "./index.css";
// Camada de paleta do design Carbon & Graphite; vem depois para vencer a cascata.
import "./styles/carbon.css";

createRoot(document.getElementById("root")!).render(<App />);
