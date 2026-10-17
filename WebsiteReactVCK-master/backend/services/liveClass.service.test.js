import assert from "node:assert/strict";
import test from "node:test";

import { getMeetingAccessWindow } from "./liveClass.service.js";

test("meeting access opens 15 minutes early and closes 30 minutes late", () => {
  const start = new Date("2027-01-02T09:00:00.000Z");
  const end = new Date("2027-01-02T10:00:00.000Z");

  assert.equal(getMeetingAccessWindow(start, end, new Date("2027-01-02T08:44:59.999Z")).isTooEarly, true);
  assert.equal(getMeetingAccessWindow(start, end, new Date("2027-01-02T08:45:00.000Z")).isOpen, true);
  assert.equal(getMeetingAccessWindow(start, end, new Date("2027-01-02T10:30:00.000Z")).isOpen, true);
  assert.equal(getMeetingAccessWindow(start, end, new Date("2027-01-02T10:30:00.001Z")).isClosed, true);
});

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";

const {
  getMeetingProvider,
  isSupportedMeetingHost,
  validateMeetingUrl,
} = await import("./liveClass.service.js");

test("Jitsi Meet is accepted and identified without weakening existing providers", () => {
  assert.equal(validateMeetingUrl("https://meet.jit.si/csca-class-123"), null);
  assert.equal(getMeetingProvider("https://meet.jit.si/csca-class-123"), "Jitsi");
  assert.equal(isSupportedMeetingHost("https://meet.jit.si/csca-class-123"), true);

  assert.equal(getMeetingProvider("https://meet.google.com/abc-defg-hij"), "Google Meet");
  assert.equal(getMeetingProvider("https://us06web.zoom.us/j/123456"), "Zoom");
  assert.equal(validateMeetingUrl("https://meet.google.com/abc-defg-hij"), null);
  assert.equal(validateMeetingUrl("https://us06web.zoom.us/j/123456"), null);
});

test("lookalike and insecure Jitsi URLs are rejected", () => {
  assert.match(validateMeetingUrl("https://meet.jit.si.evil.example/room"), /Google Meet, Zoom hoặc Jitsi/);
  assert.match(validateMeetingUrl("http://meet.jit.si/room"), /Google Meet, Zoom hoặc Jitsi/);
  assert.equal(getMeetingProvider("https://meet.jit.si.evil.example/room"), null);
  assert.equal(isSupportedMeetingHost("http://meet.jit.si/room"), false);
});

test("a self-hosted Jitsi domain can be configured", () => {
  const previousHost = process.env.JITSI_HOST;
  const previousAllowedHosts = process.env.JITSI_ALLOWED_HOSTS;
  process.env.JITSI_HOST = "video.csca.example";
  process.env.JITSI_ALLOWED_HOSTS = "classroom.csca.example, https://backup.csca.example";

  try {
    for (const url of [
      "https://video.csca.example/room-a",
      "https://classroom.csca.example/room-b",
      "https://backup.csca.example/room-c",
    ]) {
      assert.equal(validateMeetingUrl(url), null, url);
      assert.equal(getMeetingProvider(url), "Jitsi", url);
    }
  } finally {
    if (previousHost === undefined) delete process.env.JITSI_HOST;
    else process.env.JITSI_HOST = previousHost;
    if (previousAllowedHosts === undefined) delete process.env.JITSI_ALLOWED_HOSTS;
    else process.env.JITSI_ALLOWED_HOSTS = previousAllowedHosts;
  }
});
