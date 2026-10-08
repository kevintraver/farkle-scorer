export const FACE_VALUES = [1, 2, 3, 4, 5, 6] as const;
export type FaceValue = (typeof FACE_VALUES)[number];

export type Die = { id: string; value: FaceValue };

export function isFaceValue(value: number): value is FaceValue {
  return FACE_VALUES.some((face) => face === value);
}
