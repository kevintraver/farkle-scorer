import { isFaceValue, type Die } from "./dice";

export type ScoringGroup = {
  label: string;
  points: number;
  dice: Die[];
};

export type RollScore = {
  total: number;
  groups: ScoringGroup[];
  unusedDice: Die[];
  isFarkle: boolean;
};

export const SCORING_RULES = [
  ["Single 1", 100],
  ["Single 5", 50],
  ["Three 1s", 300],
  ["Three 2s / 3s / 4s / 5s / 6s", "200 / 300 / 400 / 500 / 600"],
  ["Four of a kind", 1000],
  ["Five of a kind", 2000],
  ["Six of a kind", 3000],
  ["Straight (1–6)", 1500],
  ["Three pairs", 1500],
  ["Four of a kind + a pair", 1500],
  ["Two triplets", 2500],
] as const;

function scoreGroup(dice: Die[]): ScoringGroup | null {
  const counts = new Map<number, number>();
  for (const die of dice) counts.set(die.value, (counts.get(die.value) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => a - b);
  const face = dice[0].value;
  let label = "";
  let points = 0;

  if (dice.length === 1 && (face === 1 || face === 5)) {
    label = `Single ${face}`;
    points = face === 1 ? 100 : 50;
  } else if (counts.size === 1 && dice.length >= 3) {
    label = `${dice.length} × ${face}`;
    points = dice.length === 3 ? (face === 1 ? 300 : face * 100) : (dice.length - 3) * 1000;
  } else if (dice.length === 6) {
    if (counts.size === 6) {
      label = "Straight (1–6)";
      points = 1500;
    } else if (sizes.join(",") === "2,2,2") {
      label = "Three pairs";
      points = 1500;
    } else if (sizes.join(",") === "2,4") {
      label = "Four of a kind + a pair";
      points = 1500;
    } else if (sizes.join(",") === "3,3") {
      label = "Two triplets";
      points = 2500;
    }
  }

  return points > 0 ? { label, points, dice } : null;
}

/** Find the highest score over disjoint scoring subsets of one roll. */
export function scoreRoll(dice: Die[]): RollScore {
  if (dice.length < 1 || dice.length > 6 || dice.some((die) => !isFaceValue(die.value))) {
    throw new RangeError("A roll must contain 1–6 dice with values from 1 to 6.");
  }
  if (new Set(dice.map((die) => die.id)).size !== dice.length) {
    throw new RangeError("Each die must have a unique ID.");
  }

  const candidates: { mask: number; group: ScoringGroup }[] = [];
  const fullMask = (1 << dice.length) - 1;
  for (let mask = 1; mask <= fullMask; mask++) {
    const group = scoreGroup(dice.filter((_, index) => mask & (1 << index)));
    if (group) candidates.push({ mask, group });
  }

  type Solution = { total: number; groups: ScoringGroup[]; used: number };
  const memo = new Map<number, Solution>();
  function best(remaining: number): Solution {
    const cached = memo.get(remaining);
    if (cached) return cached;
    let result: Solution = { total: 0, groups: [], used: 0 };
    for (const { mask, group } of candidates) {
      if ((mask & remaining) !== mask) continue;
      const rest = best(remaining ^ mask);
      const total = group.points + rest.total;
      const groups = [group, ...rest.groups];
      // Prefer a simpler breakdown when totals tie (e.g. three 1s vs three singles).
      if (total > result.total || (total === result.total && groups.length < result.groups.length)) {
        result = { total, groups, used: mask | rest.used };
      }
    }
    memo.set(remaining, result);
    return result;
  }

  const result = best(fullMask);
  return {
    total: result.total,
    groups: result.groups,
    unusedDice: dice.filter((_, index) => !(result.used & (1 << index))),
    isFarkle: result.total === 0,
  };
}
