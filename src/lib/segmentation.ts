import OpenAI from "openai";
import sharp from "sharp";
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ImageSegmentationResult, type SegmentationMaskRecord } from "@meta-sam/parser";
import { SAM_MODEL, SAM_PROMPT, type DiceCrop, type Segmentation } from "./segmentation-types";
import { MAX_IMAGE_EDGE } from "./upload";

export class SegmentationError extends Error {}

// Apply EXIF orientation before both segmentation and cropping, so coordinates agree.
export async function prepareImage(bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function buildSegmentationRequest(imageUrl: string) {
  return {
    model: SAM_MODEL,
    input: [{ type: "message" as const, role: "user" as const, content: [
      { type: "input_text" as const, text: SAM_PROMPT },
      { type: "input_image" as const, image_url: imageUrl, detail: "high" as const },
    ] }],
    stream: true as const,
    metadata: { mask_encoding: "one_bit" },
  };
}

export async function createDiceCrop(image: Awaited<ReturnType<typeof prepareImage>>, record: SegmentationMaskRecord): Promise<DiceCrop> {
  const { left, top, right, bottom } = record.bounds;
  if (right > image.width || bottom > image.height) {
    throw new SegmentationError("Meta returned a mask outside the photo. Try analyzing again.");
  }
  const width = right - left;
  const height = bottom - top;
  const raster = decodeMaskToRaster(record.mask);
  if (!raster.includes(1)) throw new SegmentationError("Meta returned an empty die mask. Try a clearer photo.");
  const mask = await sharp(Buffer.from(raster.map((pixel) => pixel * 255)), {
    raw: { width: record.mask.width, height: record.mask.height, channels: 1 },
  }).resize(width, height, { fit: "fill", kernel: "nearest" }).greyscale().raw().toBuffer();
  const pixels = await sharp(image.data).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();

  // Keep only this object's pixels. Nearby dice inside its box become white.
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 0) pixels.fill(255, index * 3, index * 3 + 3);
  }
  const padding = Math.max(4, Math.round(Math.max(width, height) * 0.08));
  const crop = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: "#ffffff" })
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .png().toBuffer();

  // Preserve the table, shadows, and nearby objects as orientation cues.
  const contextPadding = Math.round(Math.max(width, height) * 0.5);
  const contextLeft = Math.max(0, left - contextPadding);
  const contextTop = Math.max(0, top - contextPadding);
  const contextWidth = Math.min(image.width, right + contextPadding) - contextLeft;
  const contextHeight = Math.min(image.height, bottom + contextPadding) - contextTop;
  const strokeWidth = Math.max(2, Math.round(Math.max(contextWidth, contextHeight) / 256));
  const boxLeft = Math.max(strokeWidth / 2, left - contextLeft - strokeWidth);
  const boxTop = Math.max(strokeWidth / 2, top - contextTop - strokeWidth);
  const boxRight = Math.min(contextWidth - strokeWidth / 2, right - contextLeft + strokeWidth);
  const boxBottom = Math.min(contextHeight - strokeWidth / 2, bottom - contextTop + strokeWidth);
  const outline = Buffer.from(`<svg width="${contextWidth}" height="${contextHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="${boxLeft}" y="${boxTop}" width="${boxRight - boxLeft}" height="${boxBottom - boxTop}" fill="none" stroke="#06b6d4" stroke-width="${strokeWidth}"/></svg>`);
  const context = await sharp(image.data)
    .extract({ left: contextLeft, top: contextTop, width: contextWidth, height: contextHeight })
    .composite([{ input: outline }])
    .png().toBuffer();
  const resizedContext = await sharp(context)
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .png().toBuffer();
  return {
    id: `sam-${record.objectId}`, objectId: record.objectId, bounds: record.bounds,
    imageUrl: `data:image/png;base64,${crop.toString("base64")}`,
    contextImageUrl: `data:image/png;base64,${resizedContext.toString("base64")}`,
  };
}

export async function cropsFromSegmentation(image: Awaited<ReturnType<typeof prepareImage>>, result: ImageSegmentationResult) {
  if (result.outcome.status !== "completed" || result.diagnostics.some((item) => item.severity === "error") || recordsOfKind(result.records, "text").length > 0) {
    throw new SegmentationError("Meta did not return complete, readable segmentation. Try analyzing again.");
  }
  const masks = recordsOfKind(result.records, "mask");
  if (new Set(masks.map((mask) => mask.objectId)).size !== masks.length) {
    throw new SegmentationError("Meta returned duplicate die masks. Try analyzing again.");
  }
  // An invalid roll is never silently truncated to six detections.
  const crops = masks.length > 6 ? [] : await Promise.all(masks.map((mask) => createDiceCrop(image, mask)));
  return { crops, detectedCount: masks.length, warnings: result.diagnostics.map((item) => item.message) };
}

export async function segmentDice(image: Awaited<ReturnType<typeof prepareImage>>, signal: AbortSignal): Promise<Segmentation> {
  const startedAt = performance.now();
  const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY, timeout: 60_000, maxRetries: 0 });
  const events = await client.responses.create(buildSegmentationRequest(`data:image/png;base64,${image.data.toString("base64")}`), { signal });
  const result = await parseImageStream(events).finalResult;
  return {
    model: SAM_MODEL, prompt: SAM_PROMPT, width: image.width, height: image.height,
    ...await cropsFromSegmentation(image, result),
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
