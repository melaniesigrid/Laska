import { describe, expect, test } from "vitest";
import { resolveApiBase, resolveWsUrl } from "./client.ts";

describe("auth URL resolution", () => {
  test("uses a same-origin API proxy in production", () => {
    expect(resolveApiBase(undefined, "https://playlaska.com")).toBe("/api");
  });

  test("uses an explicit backend override when provided", () => {
    expect(
      resolveApiBase("https://api.example.com", "https://playlaska.com"),
    ).toBe("https://api.example.com");
  });

  test("keeps the local development fallback for localhost", () => {
    expect(resolveApiBase(undefined, "http://localhost:5173")).toBe(
      "http://localhost:8080",
    );
  });

  test("builds a websocket URL from the same-origin proxy", () => {
    expect(resolveWsUrl("/api", "https://playlaska.com")).toBe(
      "wss://playlaska.com/ws",
    );
  });
});
