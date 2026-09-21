import "./styles.css";
import { boot } from "./app.js";

boot().catch((error) => {
  console.error("Failed to initialize scene:", error);
});
