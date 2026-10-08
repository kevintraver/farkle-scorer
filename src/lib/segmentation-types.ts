export const SAM_MODEL = "sam-3.1";
export const SAM_PROMPT = "dice";

export type DiceCrop = {
  id: string;
  objectId: string;
  imageUrl: string;
  bounds: { left: number; top: number; right: number; bottom: number };
};

export type Segmentation = {
  model: string;
  prompt: string;
  width: number;
  height: number;
  detectedCount: number;
  crops: DiceCrop[];
  warnings: string[];
  elapsedMs: number;
};
