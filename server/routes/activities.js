import { Router } from "express";
import { getAllActivities, upsertActivity, deleteActivity } from "../db/queries.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(getAllActivities());
});

router.post("/", (req, res) => {
  const { label, energyCost, locationType, sortOrder } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: "label required" });
  const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const activity = upsertActivity({ id, label: label.trim(), energyCost, locationType, sortOrder });
  res.status(201).json(activity);
});

router.put("/:id", (req, res) => {
  const activity = upsertActivity({ ...req.body, id: req.params.id });
  res.json(activity);
});

router.delete("/:id", (req, res) => {
  deleteActivity(req.params.id);
  res.json({ ok: true });
});

export default router;
