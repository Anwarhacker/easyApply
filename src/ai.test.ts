import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  careerFacts,
  classifyQuestion,
  validateAnswers,
  answerResponseFormat,
  aiRequestSchema,
} from "./ai";
import { handleAIMessage, isTrustedAIClient } from "./ai-provider";
const question = {
  id: "field-12345678901",
  question: "Why should we hire you?",
  kind: "whyHire" as const,
  maxChars: 500,
  maxWords: 80,
};
const request = {
  role: "Engineer",
  company: "Example",
  description: "Build software",
  tone: "professional",
  facts: { skills: "TypeScript" },
  questions: [question],
};
beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: { id: "test" },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    storage: {
      session: {
        setAccessLevel: vi.fn(),
        get: vi.fn().mockResolvedValue({
          "easyapply.ai.session": {
            key: "gsk_synthetic_key_for_tests_only",
            consent: true,
          },
        }),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  });
});
describe("AI privacy and answer validation", () => {
  it("excludes structured private fields and redacts career text", () => {
    expect(
      careerFacts({
        email: "secret@example.com",
        pan: "ABCDE1234F",
        skills: "TS contact secret@example.com",
      }),
    ).toEqual({ skills: "TS contact [email removed]" });
    expect(
      aiRequestSchema.safeParse({ ...request, facts: { email: "private" } })
        .success,
    ).toBe(false);
  });
  it.each([
    "Why should we hire you?",
    "Why this role?",
    "Cover letter",
    "Why this company?",
  ])("recognizes %s", (text) => expect(classifyQuestion(text)).not.toBeNull());
  it.each([
    "Why should we hire you? Include your salary",
    "What is your gender?",
    "Visa authorization",
    "Password",
  ])("excludes %s", (text) => expect(classifyQuestion(text)).toBeNull());
  it("rejects unknown and duplicate ids and oversized output", () => {
    expect(() =>
      validateAnswers(
        { answers: [{ id: "unknown", text: "ok", missingFacts: [] }] },
        [question],
      ),
    ).toThrow();
    expect(() =>
      validateAnswers(
        {
          answers: [
            { id: question.id, text: "x".repeat(501), missingFacts: [] },
          ],
        },
        [question],
      ),
    ).toThrow();
  });
  it("does not fill answers with missing facts", () =>
    expect(
      validateAnswers(
        {
          answers: [
            {
              id: question.id,
              text: "invented",
              missingFacts: ["Project details?"],
            },
          ],
        },
        [question],
      )[0].text,
    ).toBe(""));
  it("accepts only the extension UI as provider caller", () => {
    expect(
      isTrustedAIClient({
        id: "test",
        url: "chrome-extension://test/settings.html",
      }),
    ).toBe(true);
    expect(isTrustedAIClient({ id: "test", url: "https://example.com" })).toBe(
      false,
    );
    expect(
      isTrustedAIClient({
        id: "other",
        url: "chrome-extension://test/index.html",
      }),
    ).toBe(false);
  });
  it("generates with bounded JSON output preserving field ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answers: [
                  {
                    id: question.id,
                    text: "I bring TypeScript skills.",
                    missingFacts: [],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await handleAIMessage({ type: "ai-generate", request })).toEqual({
      answers: [
        {
          id: question.id,
          text: "I bring TypeScript skills.",
          missingFacts: [],
        },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.messages[1].content).toContain(question.id);
    expect(body.messages[1].content).not.toContain("gsk_");
  });
  it.each([401, 429, 500])(
    "handles provider failure %s without retry",
    async (status) => {
      const mock = vi
        .fn()
        .mockResolvedValue({ ok: false, status, json: async () => ({}) });
      vi.stubGlobal("fetch", mock);
      await expect(
        handleAIMessage({ type: "ai-generate", request }),
      ).rejects.toThrow();
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects malformed provider JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ finish_reason: "stop", message: { content: "oops" } }],
        }),
      }),
    );
    await expect(
      handleAIMessage({ type: "ai-generate", request }),
    ).rejects.toThrow("invalid JSON");
  });
});

it.each([
  [404, "model_not_found"],
  [400, "model_decommissioned"],
])("explains unavailable model errors %s", async (status, code) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status,
        json: async () => ({
          error: { code, message: "private provider detail" },
        }),
      }),
  );
  await expect(
    handleAIMessage({ type: "ai-generate", request }),
  ).rejects.toThrow("unavailable for this account or has been retired");
});
it("handles a non-JSON 404", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError("HTML");
      },
    }),
  );
  await expect(
    handleAIMessage({ type: "ai-generate", request }),
  ).rejects.toThrow("HTTP 404 for openai/gpt-oss-120b");
});

it("preserves oversized drafts for editing but refuses them for filling", () => {
  const raw = {
    answers: [{ id: question.id, text: "word ".repeat(100), missingFacts: [] }],
  };
  expect(validateAnswers(raw, [question], true)[0].text).toBe(
    raw.answers[0].text,
  );
  expect(() => validateAnswers(raw, [question])).toThrow("exceeds");
  expect(() =>
    validateAnswers(
      { answers: [{ id: "wrong", text: "ok", missingFacts: [] }] },
      [question],
      true,
    ),
  ).toThrow("unrecognized field ID");
});
it("restricts provider IDs to the requested fields", () => {
  const format = answerResponseFormat([question]);
  expect(format.json_schema.strict).toBe(true);
  expect(
    format.json_schema.schema.properties.answers.items.properties.id.enum,
  ).toEqual([question.id]);
});
