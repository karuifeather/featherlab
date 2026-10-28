/**
 * @param {string|string[]} submitted — option ID (single) or array of IDs (multi-select)
 * @param {{ type: string, correctIds: string[] }} answerKey — from definition._answers[questionId]
 * @returns {boolean}
 */
export function evaluateAnswer(submitted, answerKey) {
  if (answerKey.type === "single-choice") {
    return typeof submitted === "string" && submitted === answerKey.correctIds[0];
  }
  // multiple-select: exact set equality
  if (!Array.isArray(submitted)) return false;
  const s = new Set(submitted);
  const c = new Set(answerKey.correctIds);
  if (s.size !== c.size) return false;
  for (const id of c) if (!s.has(id)) return false;
  return true;
}
