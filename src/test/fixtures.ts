import type { AnalysisResult, DecisionResponse } from "@/lib/recognition";
import { parseRecognition, resolvedDice } from "@/lib/recognition";
import { scoreRoll } from "@/lib/scoring";
import { SAM_MODEL, SAM_PROMPT, type Segmentation } from "@/lib/segmentation-types";

export function decisionFor(value: number | string): DecisionResponse {
  return {
    model: "gpt-6-luna",
    answers: [{
      type: "choice", name: "top_face", choice: String(value), confidence: 0.98,
      probabilities: [{ value: String(value), probability: 0.99 }, { value: "unclear", probability: 0.01 }],
    }],
    usage: { input_tokens: 150, output_tokens: 0, total_tokens: 150 },
  };
}

export function segmentationFor(count = 6): Segmentation {
  return {
    model: SAM_MODEL, prompt: SAM_PROMPT, width: 512, height: 128, detectedCount: count,
    crops: count > 6 ? [] : Array.from({ length: count }, (_, index) => ({
      id: `sam-${index}`, objectId: String(index), imageUrl: `data:image/png;base64,crop${index}`,
      contextImageUrl: `data:image/png;base64,context${index}`,
      bounds: { left: index * 70, top: 10, right: index * 70 + 60, bottom: 37 },
    })),
    warnings: [], elapsedMs: 500,
  };
}

export function analysisFor(values: (number | string)[] = [2, 2, 2, 1, 5, 6]): AnalysisResult {
  const segmentation = segmentationFor(values.length);
  const decisions = values.length > 6 ? [] : values.map((value, index) => ({ id: `sam-${index}`, response: decisionFor(value) }));
  const recognition = parseRecognition(segmentation, decisions);
  const dice = resolvedDice(recognition.dice);
  return { ok: true, segmentation, recognition, score: dice ? scoreRoll(dice) : null, diagnostics: { decisions, elapsedMs: 1200, recognitionMs: 700 } };
}
