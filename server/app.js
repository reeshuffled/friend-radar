import express from "express";

import authRoutes from "./routes/auth.js";
import calendarRoutes from "./routes/calendar.js";
import friendsRoutes from "./routes/friends.js";
import eventsRoutes from "./routes/events.js";
import syncRoutes from "./routes/sync.js";
import activitiesRoutes from "./routes/activities.js";

const app = express();

app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/activities", activitiesRoutes);

export default app;
