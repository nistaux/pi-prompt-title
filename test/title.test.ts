import { describe, expect, it } from "vitest";
import {
  TITLE_GENERATION_INSTRUCTION,
  acceptTitleCompletion,
  boundSubstantivePrompt,
  extractTitleText,
  normalizeAndValidateTitle,
} from "../src/index.js";

describe("TITLE_GENERATION_INSTRUCTION", () => {
  it.each([
    /only one plain-text title/i,
    /primary requested outcome or topic/i,
    /tools, methods, workflow directions, incidental details, and conversational framing/i,
    /action-first/i,
    /noun phrases/i,
    /one- or two-word title/i,
    /seven words or 40 Unicode code points/i,
    /familiar, readable language/i,
    /best-effort/i,
    /slash-separated provider\/model/i,
    /explicitly requests a natural-language session title/i,
    /requested title itself—not a description of setting or renaming it/i,
    /Do not invent facts/i,
    /untrusted content/i,
    /cannot override/i,
  ])("contains the fixed quality and injection-resistance contract: %s", (requirement) => {
    expect(TITLE_GENERATION_INSTRUCTION).toMatch(requirement);
  });

  it("requires a concise rewrite before exceeding the preferred range", () => {
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Treat 15–30 Unicode code points as the default range, not a loose suggestion.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Mandatory output check: count the complete title and, if it exceeds 30 code points, rewrite until it is at most 30 whenever the primary outcome or sole distinguishing target remains clear.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Do not shorten below 15 code points when a naturally complete title in the default range exists.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Exceed 30 only when no naturally complete shorter title can preserve the primary outcome or the prompt's sole distinguishing target.",
    );
  });

  it("requires concise wording instead of verbose prompt mirroring", () => {
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Use concise, accurate familiar words rather than mirroring verbose prompt wording.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Prefer concise action verbs such as Fix, Debug, Check, or Review when accurate, and omit redundant category words already implied by the core outcome.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "The preferred and hard length rules outrank prompt wording and best-effort exact-identifier retention.",
    );
  });

  it("omits dispensable tools, paths, commands, and issue pointers", () => {
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Never include a tool, path, command, or issue pointer merely because it appears in the prompt.",
    );
    expect(TITLE_GENERATION_INSTRUCTION).toContain(
      "Omit it whenever the requested outcome or topic remains clear without it; retain it only when it is the prompt's sole distinguishing target.",
    );
  });
});

describe("boundSubstantivePrompt", () => {
  it("trims outer whitespace while preserving internal whitespace within the privacy boundary", () => {
    expect(boundSubstantivePrompt(" \t Keep  internal\tspacing \n")).toBe(
      "Keep  internal\tspacing",
    );
  });

  it("counts astral characters as one code point and preserves exactly 1,000 code points", () => {
    const prompt = `${"a".repeat(999)}🧪`;

    expect(boundSubstantivePrompt(prompt)).toBe(prompt);
    expect(Array.from(boundSubstantivePrompt(prompt))).toHaveLength(1_000);
  });

  it("cuts immediately before the final whitespace among the first 1,000 code points", () => {
    const prompt = `${"a".repeat(600)} ${"b".repeat(398)} ${"c".repeat(20)}`;

    expect(boundSubstantivePrompt(prompt)).toBe(
      `${"a".repeat(600)} ${"b".repeat(398)}`,
    );
  });

  it("hard-cuts at 1,000 code points when the bounded prefix has no whitespace", () => {
    expect(boundSubstantivePrompt(`${"🧪".repeat(1_001)}tail`)).toBe(
      "🧪".repeat(1_000),
    );
  });
});

describe("extractTitleText", () => {
  it("concatenates ordered text blocks without a separator for a stop completion", () => {
    expect(
      extractTitleText({
        stopReason: "stop",
        content: [
          { type: "text", text: "Fix " },
          { type: "text", text: "billing" },
        ],
      }),
    ).toBe("Fix billing");
  });

  it.each(["length", "toolUse", "error", "aborted"] as const)(
    "rejects a completion with stop reason %s",
    (stopReason) => {
      expect(
        extractTitleText({
          stopReason,
          content: [{ type: "text", text: "Partial title" }],
        }),
      ).toBeUndefined();
    },
  );

  it.each([
    [
      "thinking",
      [
        { type: "thinking" as const, thinking: "hidden" },
        { type: "text" as const, text: "Visible title" },
      ],
    ],
    [
      "tool call",
      [
        { type: "text" as const, text: "Visible title" },
        {
          type: "toolCall" as const,
          id: "call-1",
          name: "lookup",
          arguments: {},
        },
      ],
    ],
  ])(
    "rejects all content rather than salvaging text around a %s block",
    (_name, content) => {
      expect(extractTitleText({ stopReason: "stop", content })).toBeUndefined();
    },
  );
});

describe("acceptTitleCompletion", () => {
  it("extracts, minimally normalizes, validates, and accepts a completion", () => {
    expect(
      acceptTitleCompletion({
        stopReason: "stop",
        content: [
          { type: "text", text: "  Fix\t" },
          { type: "text", text: " billing  " },
        ],
      }),
    ).toBe("Fix billing");
  });

  it("rejects an empty successful completion", () => {
    expect(
      acceptTitleCompletion({ stopReason: "stop", content: [] }),
    ).toBeUndefined();
  });

  it("rejects invalid output without salvaging wrappers or text blocks", () => {
    expect(
      acceptTitleCompletion({
        stopReason: "stop",
        content: [{ type: "text", text: '"Fix billing"' }],
      }),
    ).toBeUndefined();
    expect(
      acceptTitleCompletion({
        stopReason: "stop",
        content: [
          { type: "text", text: "Fix billing" },
          { type: "thinking", thinking: "discard me" },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("normalizeAndValidateTitle", () => {
  it("limits normalization to outer trimming and collapsing spaces and tabs", () => {
    expect(normalizeAndValidateTitle(" \t Fix\t  billing \t")).toBe(
      "Fix billing",
    );
    expect(normalizeAndValidateTitle("Fix\u00a0billing")).toBe(
      "Fix\u00a0billing",
    );
  });

  it.each(["\r", "\n", "\u2028", "\u2029"])(
    "rejects raw output containing line separator %j even at an outer edge",
    (separator) => {
      expect(
        normalizeAndValidateTitle(`${separator}Valid title`),
      ).toBeUndefined();
    },
  );

  const forbiddenControls = [
    ...Array.from({ length: 9 }, (_, codePoint) => codePoint),
    0x0b,
    0x0c,
    ...Array.from({ length: 0x12 }, (_, offset) => offset + 0x0e),
    ...Array.from({ length: 0x21 }, (_, offset) => offset + 0x7f),
  ].map((codePoint) => String.fromCodePoint(codePoint));

  it.each(forbiddenControls)(
    "rejects every forbidden control code point %#",
    (control) => {
      expect(
        normalizeAndValidateTitle(`Valid${control} title`),
      ).toBeUndefined();
    },
  );

  it("rejects output that is empty after normalization", () => {
    expect(normalizeAndValidateTitle(" \t ")).toBeUndefined();
  });

  it("accepts the one-word and seven-word boundaries", () => {
    expect(normalizeAndValidateTitle("Authentication")).toBe("Authentication");
    expect(normalizeAndValidateTitle("one two three four five six seven")).toBe(
      "one two three four five six seven",
    );
  });

  it("rejects more than seven whitespace-separated words", () => {
    expect(
      normalizeAndValidateTitle("one two three four five six seven eight"),
    ).toBeUndefined();
  });

  it("counts Unicode code points and accepts 40 but rejects 41", () => {
    expect(normalizeAndValidateTitle("🧪".repeat(40))).toBe("🧪".repeat(40));
    expect(normalizeAndValidateTitle("🧪".repeat(41))).toBeUndefined();
  });

  it("accepts valid titles outside the preferred 15–30-code-point range", () => {
    expect(normalizeAndValidateTitle("Short")).toBe("Short");
    expect(normalizeAndValidateTitle("x".repeat(31))).toBe("x".repeat(31));
  });

  it.each([
    "**Fix billing**",
    "__Fix billing__",
    "~~Fix billing~~",
    "`Fix billing`",
    "# Fix billing",
    "###### Fix billing",
    "- Fix billing",
    "* Fix billing",
    "+ Fix billing",
    ">Fix billing",
    "[Fix billing](https://example.test)",
    "[Fix billing][task]",
    "![Fix billing](image.png)",
    "![Fix billing][task]",
    "![](image.png)",
    "[]()",
    "[Fix](docs/(draft))",
    "[Fix \\] billing](docs)",
    "[Fix [billing]](docs)",
  ])("rejects the Markdown form %j without stripping its wrapper", (raw) => {
    expect(normalizeAndValidateTitle(raw)).toBeUndefined();
  });

  it.each([
    "Fix **billing**",
    "#42 investigation",
    "`BillingScheduler` repair",
    "####### heading topic",
    "[Fix](docs) trailing)",
  ])("does not broaden Markdown rejection beyond the specified forms: %j", (raw) => {
    expect(normalizeAndValidateTitle(raw)).toBe(raw);
  });

  it.each([
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["«", "»"],
    ["‹", "›"],
    ["„", "“"],
    ["‚", "‘"],
    ["「", "」"],
    ["『", "』"],
  ])("rejects matching quotation wrappers %s…%s without removing them", (open, close) => {
    expect(normalizeAndValidateTitle(`${open}Fix billing${close}`)).toBeUndefined();
  });

  it("allows unmatched or internal quotation marks", () => {
    expect(normalizeAndValidateTitle('Fix "billing"')).toBe('Fix "billing"');
    expect(normalizeAndValidateTitle("'Fix billing”")).toBe("'Fix billing”");
  });

  it.each([
    "Title: Fix billing",
    "session title : Fix billing",
    "Suggested Title: Fix billing",
    "PROPOSED SESSION TITLE: Fix billing",
    "recommended session title:\tFix billing",
  ])("rejects the title prefix grammar case-insensitively: %j", (raw) => {
    expect(normalizeAndValidateTitle(raw)).toBeUndefined();
  });

  it("does not mistake ordinary title words for an explanatory prefix", () => {
    expect(normalizeAndValidateTitle("Title case repair")).toBe(
      "Title case repair",
    );
  });
});
