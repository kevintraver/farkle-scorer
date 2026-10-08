import { describe, expect, it } from "vitest";
import { isFaceValue, type Die } from "./dice";
import { scoreRoll } from "./scoring";

function roll(values: number[]): Die[] {
  return values.map((value, index) => {
    if (!isFaceValue(value)) throw new Error("Invalid test die");
    return { id: String(index), value };
  });
}

describe("scoreRoll", () => {
  it.each([
    [[1], 100], [[5], 50], [[2], 0],
    [[1, 5], 150], [[1, 1], 200], [[5, 5], 100],
    [[1, 1, 1], 300], [[2, 2, 2], 200], [[3, 3, 3], 300],
    [[4, 4, 4], 400], [[5, 5, 5], 500], [[6, 6, 6], 600],
    [[1, 1, 1, 1], 1000], [[2, 2, 2, 2], 1000],
    [[5, 5, 5, 5, 5], 2000], [[6, 6, 6, 6, 6, 6], 3000],
    [[1, 2, 3, 4, 5, 6], 1500], [[2, 2, 3, 3, 4, 4], 1500],
    [[2, 2, 2, 2, 4, 4], 1500], [[2, 2, 2, 3, 3, 3], 2500],
    [[2, 2, 2, 1, 5, 6], 350], [[2, 2, 3, 3, 4, 6], 0],
    [[1, 1, 1, 1, 5, 6], 1050], [[1, 1, 1, 1, 1, 5], 2050],
    [[1, 1, 1, 5, 5, 5], 2500], [[1, 1, 5, 5, 6, 6], 1500],
  ])("scores %j as %i", (values, expected) => {
    const dice = roll(values);
    const result = scoreRoll(dice);
    expect(result.total).toBe(expected);
    expect(result.isFarkle).toBe(expected === 0);
    expect(result.groups.reduce((sum, group) => sum + group.points, 0)).toBe(expected);
    const scoredIds = result.groups.flatMap((group) => group.dice.map((die) => die.id));
    const unusedIds = result.unusedDice.map((die) => die.id);
    expect(new Set([...scoredIds, ...unusedIds]).size).toBe(dice.length);
    expect(scoredIds.length + unusedIds.length).toBe(dice.length);
  });

  it("prefers one triple over three separate 1s with the same score", () => {
    expect(scoreRoll(roll([1, 1, 1])).groups).toHaveLength(1);
  });

  it("finds the same optimum for all permutations of a mixed roll", () => {
    function permutations(values: number[]): number[][] {
      if (values.length === 0) return [[]];
      return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map((tail) => [value, ...tail]));
    }
    for (const values of permutations([2, 2, 2, 1, 5, 6])) expect(scoreRoll(roll(values)).total).toBe(350);
  });

  it("does not mutate the roll and identifies unscored dice", () => {
    const dice = roll([2, 2, 2, 1, 5, 6]);
    const original = structuredClone(dice);
    expect(scoreRoll(dice).unusedDice).toEqual([dice[5]]);
    expect(dice).toEqual(original);
  });

  it("rejects empty, oversized, or duplicate-ID rolls instead of reporting Farkle", () => {
    expect(() => scoreRoll([])).toThrow(RangeError);
    expect(() => scoreRoll(roll([1, 1, 1, 1, 1, 1, 1]))).toThrow(RangeError);
    expect(() => scoreRoll([{ id: "same", value: 1 }, { id: "same", value: 5 }])).toThrow(RangeError);
  });
});
