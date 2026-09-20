import { describe, expect, it } from "vitest";
import { message } from "@/i18n/config";
import sourceMessages from "@/i18n/messages/extracted.en.json";
import persianMessages from "@/i18n/messages/fa.json";

describe("translations", () => {
  it("uses Persian translations and falls back to English", () => {
    expect(message("fa", "Collection")).toBe("مجموعه");
    expect(message("fa", "A future message")).toBe("A future message");
  });

  it("can switch translated DOM text back to English", () => {
    expect(message("en", "مجموعه")).toBe("Collection");
    expect(message("ar", "مجموعه")).toBe("المجموعة");
  });

  it("has a Persian translation for every extracted UI message", () => {
    expect(Object.keys(sourceMessages).filter((key) => !Object.hasOwn(persianMessages, key))).toEqual([]);
  });
});
