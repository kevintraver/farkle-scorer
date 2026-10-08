import { z } from "zod";
import { FACE_VALUES, isFaceValue, type Die, type FaceValue } from "./dice";
import type { RollScore } from "./scoring";
import type { DiceCrop, Segmentation } from "./segmentation-types";

export const MODEL = "gpt-6-luna";
export const REVIEW_THRESHOLD = 0.8;

export const IMAGE_INSTRUCTIONS = `Inspect two images of the same target object from a photograph of a dice roll.
Image 1 isolates the target object; the area outside its segmentation mask is white.
Image 2 shows a wider, unmasked crop of the original photo. A cyan rectangle marks the target object's location. The surrounding surface, shadows, and neighboring objects provide orientation context.
Both images preserve the original photo's orientation.

Use Image 1 to identify the target die and both views to determine its upward-facing top face and read its pips.
- The top face points away from the surface the die rests on. It is not necessarily the largest visible face or the face highest in the image.
- Count pips on the top face, not on side faces.
- Ignore neighboring dice in Image 2. Read only the target identified by Image 1 and the cyan rectangle.
- Ignore all pip and die colors when determining the value; the cyan rectangle is only a locator.
- Do not infer a hidden or unreadable top face from side faces or opposite-face conventions.
- Choose "unclear" if the top face cannot be read from either view, the target is ambiguous, or Image 1 contains multiple dice. Neighboring dice in Image 2 alone do not make the answer unclear.
- Choose "not_a_die" if this object is not a six-sided pip die.
- Do not calculate a game score.`;

export const QUESTIONS = [{
  type: "choice" as const,
  name: "top_face",
  instructions: "What number is on the upward-facing top face of this die?",
  choices: [
    ...FACE_VALUES.map((value) => ({ value: String(value), description: `The top face shows ${value} ${value === 1 ? "pip" : "pips"}.` })),
    { value: "unclear", description: "The target's top-face value cannot be read reliably, the target is ambiguous, or the isolated image contains multiple dice." },
    { value: "not_a_die", description: "The segmented object is not a six-sided pip die." },
  ],
}];

export const decisionResponseSchema = z.object({
  model: z.string(),
  answers: z.array(z.discriminatedUnion("type", [
    z.object({
      type: z.literal("choice"), name: z.string().nullable(),
      choice: z.union([z.string(), z.boolean()]), confidence: z.number().min(0).max(1),
      probabilities: z.array(z.object({ value: z.union([z.string(), z.boolean()]), probability: z.number().min(0).max(1) })),
    }),
    z.object({ type: z.literal("refusal"), name: z.string().nullable() }),
  ])),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number(), total_tokens: z.number() }).passthrough(),
}).passthrough();

export type DecisionResponse = z.infer<typeof decisionResponseSchema>;
export type CropDecision = { id: string; response: DecisionResponse | null; error?: string };
export type DraftDie = { id: string; value: FaceValue | null };
export type Recognition = {
  status: "ready" | "needs_review" | "needs_correction";
  dice: DraftDie[];
  issues: string[];
};
export type AnalysisResult = {
  ok: true;
  segmentation: Segmentation;
  recognition: Recognition;
  score: RollScore | null;
  diagnostics: { elapsedMs: number; recognitionMs: number; decisions: CropDecision[] };
};
export type AnalysisResponse = AnalysisResult | { ok: false; error: string };

export function buildDecisionRequest(crop: Pick<DiceCrop, "imageUrl" | "contextImageUrl">) {
  return {
    model: MODEL,
    input: [{ role: "user" as const, content: [
      { type: "input_text" as const, text: IMAGE_INSTRUCTIONS },
      { type: "input_image" as const, image_url: crop.imageUrl, detail: "high" as const },
      { type: "input_image" as const, image_url: crop.contextImageUrl, detail: "high" as const },
    ] }],
    questions: QUESTIONS,
  };
}

/** Null means an unfinished roll, never a zero-point Farkle. */
export function resolvedDice(dice: DraftDie[]): Die[] | null {
  if (dice.length < 1 || dice.length > 6 || dice.some((die) => die.value === null)) return null;
  return dice.flatMap((die) => die.value === null ? [] : [{ id: die.id, value: die.value }]);
}

export function parseRecognition(segmentation: Segmentation, decisions: CropDecision[]): Recognition {
  const issues: string[] = [];
  if (segmentation.detectedCount === 0) issues.push("No dice were segmented. Try another photo or enter the dice manually.");
  if (segmentation.detectedCount > 6) issues.push(`Meta detected ${segmentation.detectedCount} objects. This playground supports 1–6 dice. Try another photo or enter the roll manually.`);
  let lowConfidence = segmentation.warnings.length > 0;
  if (lowConfidence) issues.push("Meta returned segmentation warnings. Check the crops against the photo.");
  const dice = segmentation.crops.map((crop, index): DraftDie => {
    const decision = decisions.find((item) => item.id === crop.id);
    const answers = decision?.response?.answers.filter((answer) => answer.name === "top_face") ?? [];
    const answer = answers[0];
    if (answers.length !== 1 || answer.type !== "choice") {
      issues.push(`Die ${index + 1}: ${decision?.error ?? "no readable answer was returned. Enter its value or remove this crop."}`);
      return { id: crop.id, value: null };
    }
    const value = Number(answer.choice);
    if (typeof answer.choice !== "string" || !/^[1-6]$/.test(answer.choice) || !isFaceValue(value)) {
      issues.push(`Die ${index + 1}: ${answer.choice === "not_a_die" ? "this crop may not be a die. Remove it or enter its value." : "the top face is unclear. Enter its value or remove this crop."}`);
      return { id: crop.id, value: null };
    }
    if (answer.confidence < REVIEW_THRESHOLD) {
      lowConfidence = true;
    }
    return { id: crop.id, value };
  });
  return { dice, issues, status: resolvedDice(dice) === null ? "needs_correction" : lowConfidence ? "needs_review" : "ready" };
}
