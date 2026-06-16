import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

// Ensure data directory exists before DB initializes
const __dirname = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(__dirname, "../data"), { recursive: true });

import authRoutes       from "./routes/auth.js";
import calendarRoutes   from "./routes/calendar.js";
import friendsRoutes    from "./routes/friends.js";
import eventsRoutes     from "./routes/events.js";
import syncRoutes       from "./routes/sync.js";
import activitiesRoutes from "./routes/activities.js";

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json({ limit: "5mb" }));

app.use("/api/auth",       authRoutes);
app.use("/api/calendar",   calendarRoutes);
app.use("/api/friends",    friendsRoutes);
app.use("/api/events",     eventsRoutes);
app.use("/api/sync",       syncRoutes);
app.use("/api/activities", activitiesRoutes);

// Serve built React client in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Friend Radar server running on http://localhost:${PORT}`);
  console.log(`  Auth:   http://localhost:${PORT}/api/auth/status`);
  console.log(`  Login:  http://localhost:${PORT}/api/auth/google`);
});
