import OpenAI from "openai";
import { buildDecisionRequest, decisionResponseSchema, parseRecognition, resolvedDice, type AnalysisResponse, type CropDecision } from "@/lib/recognition";
import { prepareImage, segmentDice, SegmentationError } from "@/lib/segmentation";
import type { Segmentation } from "@/lib/segmentation-types";
import { scoreRoll } from "@/lib/scoring";
import { MAX_IMAGE_BYTES, validateImage } from "@/lib/upload";

export const runtime = "nodejs";

function reply(body: AnalysisResponse, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function providerError(error: unknown, provider: "Meta" | "OpenAI") {
  const key = provider === "Meta" ? "MODEL_API_KEY" : "OPENAI_API_KEY";
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return `${provider} rejected the API key. Check ${key} in .env.`;
    if (error.status === 403 || error.status === 404) return `${provider} could not access ${provider === "Meta" ? "SAM 3.1" : "Decisions with gpt-6-luna"}. Check your account's model and API access.`;
    if (error.status === 429) return `${provider}'s usage limit was reached. Check your API quota or try again shortly.`;
  }
  return `${provider} could not finish this request. Check your connection and try again.`;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, error: "Submit a photo using the upload field." }, 400);
  }
  const image = form.get("image");
  if (!(image instanceof File)) {
    return reply({ ok: false, error: "Choose a dice photo first." }, 400);
  }
  const imageError = validateImage(image);
  if (imageError) return reply({ ok: false, error: imageError }, image.size > MAX_IMAGE_BYTES ? 413 : 400);

  if (!process.env.OPENAI_API_KEY) {
    return reply({ ok: false, error: "Add OPENAI_API_KEY to .env, then restart the app to analyze photos." }, 503);
  }
  if (!process.env.MODEL_API_KEY) {
    return reply({ ok: false, error: "Add MODEL_API_KEY from Meta to .env, then restart the app to segment dice." }, 503);
  }

  const startedAt = performance.now();
  let prepared: Awaited<ReturnType<typeof prepareImage>>;
  try {
    prepared = await prepareImage(Buffer.from(await image.arrayBuffer()));
  } catch {
    return reply({ ok: false, error: "This photo couldn't be decoded. Choose another JPEG, PNG, or WebP image." }, 400);
  }

  let segmentation: Segmentation;
  try {
    segmentation = await segmentDice(prepared, request.signal);
  } catch (error) {
    return reply({ ok: false, error: error instanceof SegmentationError ? error.message : providerError(error, "Meta") }, error instanceof OpenAI.APIError && error.status === 429 ? 429 : 502);
  }

  const recognitionStartedAt = performance.now();
  const client = new OpenAI({ timeout: 60_000, maxRetries: 0 });
  // At most six independent calls. Retain every crop even if one reader fails.
  const decisions = await Promise.all(segmentation.crops.map(async (crop): Promise<CropDecision> => {
    try {
      const raw = await client.decisions.create(buildDecisionRequest(crop.imageUrl), { signal: request.signal });
      const parsed = decisionResponseSchema.safeParse(raw);
      return parsed.success ? { id: crop.id, response: parsed.data } : { id: crop.id, response: null, error: "OpenAI returned an unexpected answer. Enter this die's value." };
    } catch (error) {
      // Never expose provider error bodies, which can contain request data.
      return { id: crop.id, response: null, error: providerError(error, "OpenAI") };
    }
  }));
  const recognition = parseRecognition(segmentation, decisions);
  const dice = resolvedDice(recognition.dice);
  return reply({
    ok: true, segmentation, recognition,
    score: dice ? scoreRoll(dice) : null,
    diagnostics: {
      elapsedMs: Math.round(performance.now() - startedAt),
      recognitionMs: Math.round(performance.now() - recognitionStartedAt), decisions,
    },
  });
}
