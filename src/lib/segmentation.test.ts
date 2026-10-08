import { decodeMaskToRaster, formats, recordsOfKind } from "@meta-sam/parser";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { photoBytes, samText } from "@/test/sam-fixtures";
import { buildSegmentationRequest, cropsFromSegmentation, prepareImage } from "./segmentation";

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
