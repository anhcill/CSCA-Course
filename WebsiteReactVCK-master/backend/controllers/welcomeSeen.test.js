import test from "node:test";
import assert from "node:assert/strict";
import { toUserDto } from "../utils/userDto.js";
import { markWelcomeSeen } from "./user.controllers.js";

test("toUserDto correctly computes hasSeenWelcome and welcomeSeenAt", () => {
  const userWithoutWelcome = {
    id: 1,
    username: "newbie",
    email: "newbie@example.com",
    role: "user",
    welcome_seen_at: null,
  };
  const dto1 = toUserDto(userWithoutWelcome);
  assert.equal(dto1.hasSeenWelcome, false);
  assert.equal(dto1.welcomeSeenAt, null);

  const seenDate = new Date("2026-10-15T12:00:00Z");
  const userWithWelcome = {
    id: 2,
    username: "veteran",
    email: "veteran@example.com",
    role: "creator",
    welcome_seen_at: seenDate,
  };
  const dto2 = toUserDto(userWithWelcome);
  assert.equal(dto2.hasSeenWelcome, true);
  assert.equal(dto2.welcomeSeenAt, seenDate);
});

test("markWelcomeSeen handles unauthenticated request", async () => {
  let statusCode = null;
  let jsonBody = null;
  const req = {};
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
  };

  await markWelcomeSeen(req, res);
  assert.equal(statusCode, 401);
  assert.equal(jsonBody.success, false);
});

test("markWelcomeSeen bypasses admin without error", async () => {
  let statusCode = null;
  let jsonBody = null;
  const req = {
    user: { id: 999, role: "admin" },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
  };

  await markWelcomeSeen(req, res);
  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.equal(jsonBody.data.hasSeenWelcome, true);
});
