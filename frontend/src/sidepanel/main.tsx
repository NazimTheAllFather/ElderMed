import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AssistantWidget } from "../widget/AssistantWidget";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AssistantWidget variant="sidepanel" />
  </StrictMode>,
);
