export type Dimension = {
  key: string;
  low_label: string;
  high_label: string;
  sort_order: number;
};

export type RawScores = Record<string, number>;

/**
 * Ties resolve to the high_label side; dimensions are ordered by sort_order
 * so the resulting code's letter order matches how the quiz author defined them.
 */
export function computeResultCode(
  dimensions: Dimension[],
  rawScores: RawScores
): string {
  return [...dimensions]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((dim) => {
      const total = rawScores[dim.key] ?? 0;
      const label = total >= 0 ? dim.high_label : dim.low_label;
      return label[0].toUpperCase();
    })
    .join("");
}

export function addOptionScores(
  totals: RawScores,
  optionScores: RawScores
): RawScores {
  const next = { ...totals };
  for (const [key, value] of Object.entries(optionScores)) {
    next[key] = (next[key] ?? 0) + value;
  }
  return next;
}
