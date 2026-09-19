import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AssistantWidget } from "./AssistantWidget";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AssistantWidget variant="floating" />
  </StrictMode>,
);
