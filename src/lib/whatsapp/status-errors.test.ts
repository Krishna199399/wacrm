import { describe, expect, it } from "vitest";
import { describeFailure, failureReason } from "./status-errors";

describe("failureReason", () => {
  it("is null for non-failed statuses", () => {
    expect(failureReason({ status: "delivered" })).toBeNull();
    expect(failureReason({ status: "read", errors: [{ code: 1 }] })).toBeNull();
  });

  it("extracts Meta's code, title and details", () => {
    expect(
      failureReason({
        status: "failed",
        errors: [
          {
            code: 131049,
            title: "This message was not delivered to maintain healthy ecosystem engagement.",
            error_data: { details: "In order to maintain a healthy ecosystem engagement, the message failed to be delivered." },
          },
        ],
      })
    ).toEqual({
      code: 131049,
      title:
        "This message was not delivered to maintain healthy ecosystem engagement. — In order to maintain a healthy ecosystem engagement, the message failed to be delivered.",
    });
  });

  it("falls back to message when title is missing, and handles no errors", () => {
    expect(failureReason({ status: "failed", errors: [{ code: 131026, message: "Message undeliverable" }] })).toEqual({
      code: 131026,
      title: "Message undeliverable",
    });
    expect(failureReason({ status: "failed" })).toEqual({ code: null, title: "Failed (Meta gave no reason)" });
  });

  it("caps very long reasons", () => {
    const r = failureReason({ status: "failed", errors: [{ code: 1, title: "x".repeat(900) }] });
    expect(r!.title.length).toBe(500);
  });
});

describe("describeFailure", () => {
  it("adds a plain-language hint for known codes", () => {
    const text = describeFailure(131049, "not delivered to maintain healthy ecosystem engagement");
    expect(text).toContain("131049");
    expect(text).toContain("marketing messages");
  });

  it("still shows code and title for unknown codes", () => {
    expect(describeFailure(999999, "Something odd")).toBe("999999: Something odd");
    expect(describeFailure(null, null)).toBe("Failed");
  });
});
