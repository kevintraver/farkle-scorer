import { describe, expect, it } from "vitest";
import { analysisFor, decisionFor, segmentationFor } from "@/test/fixtures";
import { buildDecisionRequest, decisionResponseSchema, parseRecognition, resolvedDice } from "./recognition";

describe("per-crop recognition", () => {
  it("sends the isolated die followed by its context with a single top-face question", () => {
    const request = buildDecisionRequest({ imageUrl: "data:image/png;base64,crop", contextImageUrl: "data:image/png;base64,context" });
    expect(request.model).toBe("gpt-6-luna");
    expect(request.input[0].content).toHaveLength(3);
    expect(request.input[0].content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,crop" });
    expect(request.input[0].content[2]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,context" });
    expect(request.questions).toHaveLength(1);
    expect(request.questions[0].choices.map((choice) => choice.value)).toEqual(["1", "2", "3", "4", "5", "6", "unclear", "not_a_die"]);
  });

  it("matches responses to stable crop IDs, preserving individual dice", () => {
    const result = analysisFor([5, 1, 6]);
    expect(parseRecognition(result.segmentation, result.diagnostics.decisions.reverse()).dice).toEqual([
      { id: "sam-0", value: 5 }, { id: "sam-1", value: 1 }, { id: "sam-2", value: 6 },
    ]);
  });

  it("flags low confidence without losing the recognized face", () => {
    const response = decisionFor(5);
    const answer = response.answers[0];
    if (answer.type === "choice") answer.confidence = 0.7;
    expect(parseRecognition(segmentationFor(1), [{ id: "sam-0", response }])).toMatchObject({ status: "needs_review", dice: [{ value: 5 }] });
  });

  it.each(["unclear", "not_a_die", "9", "1.5", true])("leaves %s unresolved while preserving readable dice", (choice) => {
    const result = analysisFor([1, 5]);
    const answer = result.diagnostics.decisions[1].response?.answers[0];
    if (answer?.type === "choice") answer.choice = choice;
    const recognition = parseRecognition(result.segmentation, result.diagnostics.decisions);
    expect(recognition).toMatchObject({ status: "needs_correction", dice: [{ value: 1 }, { value: null }] });
    expect(resolvedDice(recognition.dice)).toBeNull();
  });

  it.each(["missing", "duplicate", "refusal", "failed"])("keeps the crop but blocks scoring on a %s answer", (issue) => {
    const response = decisionFor(1);
    if (issue === "missing") response.answers = [];
    if (issue === "duplicate") response.answers.push(response.answers[0]);
    if (issue === "refusal") response.answers = [{ type: "refusal", name: "top_face" }];
    const decision = { id: "sam-0", response: issue === "failed" ? null : response };
    expect(parseRecognition(segmentationFor(1), [decision])).toMatchObject({ status: "needs_correction", dice: [{ id: "sam-0", value: null }] });
  });

  it("never scores zero or more than six detections", () => {
    expect(analysisFor([]).score).toBeNull();
    expect(analysisFor([1, 1, 1, 1, 1, 1, 1]).score).toBeNull();
  });

  it("retains segmentation warnings for review", () => {
    const result = analysisFor([5]);
    result.segmentation.warnings = ["Ignored unknown field"];
    expect(parseRecognition(result.segmentation, result.diagnostics.decisions).status).toBe("needs_review");
  });

  it("rejects malformed provider shapes", () => {
    expect(decisionResponseSchema.safeParse({ answers: "not an array" }).success).toBe(false);
  });
});
