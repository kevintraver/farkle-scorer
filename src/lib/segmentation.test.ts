import { decodeMaskToRaster, formats, recordsOfKind } from "@meta-sam/parser";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { photoBytes, samText } from "@/test/sam-fixtures";
import { buildSegmentationRequest, createDiceCrop, cropsFromSegmentation, prepareImage } from "./segmentation";

function parsed(text = samText(1)) {
  const parser = formats.segmentation.image().createParser();
  parser.push(text);
  return parser.finish({ status: "completed" }).result;
}

describe("SAM mask cropping", () => {
  it("requests dice from Meta SAM with binary masks", () => {
    expect(buildSegmentationRequest("data:image/png;base64,photo")).toMatchObject({ model: "sam-3.1", stream: true, metadata: { mask_encoding: "one_bit" }, input: [{ content: [{ text: "dice" }, { image_url: "data:image/png;base64,photo" }] }] });
  });

  it("uses actual masks, removes background pixels, and preserves foreground colors", async () => {
    const image = await prepareImage(await photoBytes());
    const result = parsed();
    const maskRecord = recordsOfKind(result.records, "mask")[0];
    const mask = decodeMaskToRaster(maskRecord.mask);
    const { crops } = await cropsFromSegmentation(image, result);
    expect(crops[0].bounds).toEqual({ left: 0, top: 10, right: 60, bottom: 37 });
    const { data, info } = await sharp(Buffer.from(crops[0].imageUrl.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 70, height: 37, channels: 3 });
    for (const value of [0, 1]) {
      const index = mask.indexOf(value);
      expect(index).toBeGreaterThanOrEqual(0);
      const offset = ((Math.floor(index / 60) + 5) * info.width + index % 60 + 5) * 3;
      expect([...data.subarray(offset, offset + 3)]).toEqual(value ? [30, 60, 90] : [255, 255, 255]);
    }
  });

  it("normalizes EXIF rotation and strips metadata before segmentation", async () => {
    const rotated = await sharp(await photoBytes()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const image = await prepareImage(rotated);
    expect([image.width, image.height]).toEqual([128, 512]);
    expect((await sharp(image.data).metadata()).orientation).toBeUndefined();
  });

  it.each([
    { bounds: { left: 0, top: 10, right: 60, bottom: 37 }, origin: [0, 0], size: [90, 67], outline: [30, 39] },
    { bounds: { left: 452, top: 101, right: 512, bottom: 128 }, origin: [422, 71], size: [90, 57], outline: [28, 40] },
  ])("preserves original context and marks the target at photo edges: $bounds", async ({ bounds, origin, size, outline }) => {
    const pixels = Buffer.alloc(512 * 128 * 3);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 512; x++) {
        pixels.set([x % 256, y, 90], (y * 512 + x) * 3);
      }
    }
    const image = await prepareImage(await sharp(pixels, { raw: { width: 512, height: 128, channels: 3 } }).png().toBuffer());
    const record = recordsOfKind(parsed().records, "mask")[0];
    const crop = await createDiceCrop(image, { ...record, bounds });
    const { data, info } = await sharp(Buffer.from(crop.contextImageUrl.split(",")[1], "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual(size);
    // Check unmasked source pixels, both outside and inside the target's box.
    for (const [x, y] of [[10, 50], [40, 35]]) {
      const offset = (y * info.width + x) * 3;
      expect([...data.subarray(offset, offset + 3)]).toEqual([(origin[0] + x) % 256, origin[1] + y, 90]);
    }
    const outlineOffset = (outline[1] * info.width + outline[0]) * 3;
    expect([...data.subarray(outlineOffset, outlineOffset + 3)]).toEqual([6, 182, 212]);
  });

  it("limits large context images to 768 pixels while preserving proportions", async () => {
    const image = await prepareImage(await sharp({ create: { width: 2048, height: 1024, channels: 3, background: "#123456" } }).png().toBuffer());
    const record = recordsOfKind(parsed().records, "mask")[0];
    const crop = await createDiceCrop(image, { ...record, bounds: { left: 512, top: 256, right: 1536, bottom: 768 } });
    const metadata = await sharp(Buffer.from(crop.contextImageUrl.split(",")[1], "base64")).metadata();
    expect([metadata.width, metadata.height]).toEqual([768, 384]);
  });

  it("handles zero and over-six matches without selecting a subset", async () => {
    const image = await prepareImage(await photoBytes());
    expect(await cropsFromSegmentation(image, parsed(""))).toMatchObject({ crops: [], detectedCount: 0 });
    expect(await cropsFromSegmentation(image, parsed(samText(7)))).toMatchObject({ crops: [], detectedCount: 7 });
  });

  it("rejects incomplete, malformed, and duplicate segmentation instead of using partial dice", async () => {
    const image = await prepareImage(await photoBytes());
    await expect(cropsFromSegmentation(image, { ...parsed(), outcome: { status: "incomplete", reason: "eof" } })).rejects.toThrow("complete");
    await expect(cropsFromSegmentation(image, parsed(samText(1) + ",2<|broken|>"))).rejects.toThrow("complete");
    await expect(cropsFromSegmentation(image, parsed(samText(1) + "\n" + samText(1)))).rejects.toThrow("duplicate");
    await expect(cropsFromSegmentation(image, parsed("unexpected response"))).rejects.toThrow("complete");
  });
});
