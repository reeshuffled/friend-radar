import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { resetDb } from "../../../server/db/db.js";

vi.mock("../../../server/imessage.js", () => ({
  syncAppleContacts: vi.fn().mockResolvedValue([]),
  sendIMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../server/google.js", () => ({
  createCalendarEvent: vi.fn().mockResolvedValue("gcal-id-123"),
  addAttendeesToCalendarEvent: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../server/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

const { default: app } = await import("../../../server/app.js");

beforeEach(() => {
  resetDb();
});

describe("GET /api/activities", () => {
  it("returns seeded built-in activities", async () => {
    const res = await request(app).get("/api/activities");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("id");
    expect(res.body[0]).toHaveProperty("label");
  });
});

describe("POST /api/activities", () => {
  it("creates a custom activity", async () => {
    const res = await request(app)
      .post("/api/activities")
      .send({ label: "Rock Climbing", energyCost: 8, locationType: "outdoor" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("rock-climbing");
    expect(res.body.label).toBe("Rock Climbing");
  });

  it("returns 400 when label is missing", async () => {
    const res = await request(app).post("/api/activities").send({ energyCost: 5 });
    expect(res.status).toBe(400);
  });

  it("slugifies the label into the id", async () => {
    const res = await request(app)
      .post("/api/activities")
      .send({ label: "Board & Card Games!" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("board-card-games");
  });
});

describe("PUT /api/activities/:id", () => {
  it("updates an existing activity", async () => {
    await request(app)
      .post("/api/activities")
      .send({ label: "Hiking", energyCost: 6, locationType: "outdoor" });
    const res = await request(app)
      .put("/api/activities/hiking")
      .send({ id: "hiking", label: "Hiking", energyCost: 9, locationType: "outdoor" });
    expect(res.status).toBe(200);
    expect(res.body.energyCost).toBe(9);
  });
});

describe("DELETE /api/activities/:id", () => {
  it("removes a custom activity", async () => {
    await request(app)
      .post("/api/activities")
      .send({ label: "Bowling", energyCost: 4, locationType: "indoor" });
    const del = await request(app).delete("/api/activities/bowling");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const res = await request(app).get("/api/activities");
    expect(res.body.find((a) => a.id === "bowling")).toBeUndefined();
  });
});
