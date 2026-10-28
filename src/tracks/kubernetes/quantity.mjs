/**
 * Kubernetes resource quantities ("100m", "0.5", "64Mi", "134217728", "1e3") as numbers in
 * base units (cores, bytes), so equal amounts compare equal however they were written.
 * The API server may normalize the spelling ("0.1" is stored as "100m"); graders must not
 * depend on either form.
 */
const SUFFIX = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};
const QUANTITY = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:([eE][+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|[numkMGTPE])?)$/;

/** @returns {number|undefined} the amount in base units, or undefined if not a quantity */
export function parseQuantity(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = QUANTITY.exec(value.trim());
  if (!match) return undefined;
  const [, number, exponent, suffix = ""] = match;
  const base = Number(number);
  return exponent ? base * 10 ** Number(exponent.slice(1)) : base * SUFFIX[suffix];
}

export function sameQuantity(a, b) {
  const x = parseQuantity(a);
  const y = parseQuantity(b);
  if (x === undefined || y === undefined) return false;
  return Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 1e-9;
}
