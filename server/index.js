import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

// Ensure data directory exists before DB initializes
const __dirname = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(__dirname, "../data"), { recursive: true });

import app from "./app.js";
import express from "express";

const PORT = process.env.PORT ?? 3001;

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Friend Radar server running on http://localhost:${PORT}`);
  console.log(`  Auth:   http://localhost:${PORT}/api/auth/status`);
  console.log(`  Login:  http://localhost:${PORT}/api/auth/google`);
});
