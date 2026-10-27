// Colors are disabled when NO_COLOR is set or stdout is not a real terminal.
const colors = !process.env.NO_COLOR && process.stdout.isTTY;

const esc = (code) => (str) => (colors ? `\x1b[${code}m${str}\x1b[0m` : str);

export const dim = esc("2");
export const bold = esc("1");
export const green = esc("32");
export const yellow = esc("33");
export const red = esc("31");
export const cyan = esc("36");

export const SYMBOLS = {
  check: colors ? "✓" : "OK",
  cross: colors ? "✗" : "FAIL",
  dot: colors ? "·" : "-",
  arrow: colors ? "→" : "->",
};

/**
 * Print a step result line.
 * Format: "  ✓ <label>" (green) or "  ✗ <label>: <detail>" (red)
 */
export function printStep(label, { ok = true, detail = "" } = {}) {
  if (ok) {
    console.log(`  ${green(SYMBOLS.check)} ${label}`);
  } else {
    const suffix = detail ? `: ${detail}` : "";
    console.log(`  ${red(SYMBOLS.cross)} ${label}${suffix}`);
  }
}

/**
 * Print an info line with a leading dot symbol.
 */
export function printInfo(message) {
  console.log(`  ${dim(SYMBOLS.dot)} ${message}`);
}

/**
 * Print a bold section header preceded by a blank line.
 */
export function printHeader(label) {
  console.log(`\n${bold(label)}`);
}

/**
 * Print an error to stderr with an optional actionable hint.
 * @param {string} message
 * @param {{hint?: string}} [options]
 */
export function printError(message, { hint = "" } = {}) {
  process.stderr.write(`\nfeatherlab: ${bold(red(message))}\n`);
  if (hint) process.stderr.write(`  ${SYMBOLS.arrow} ${hint}\n`);
}

/**
 * Print a warning to stderr.
 */
export function printWarn(message) {
  process.stderr.write(`  ! ${yellow(message)}\n`);
}

/**
 * Print the ready banner after a successful startup.
 */
export function printReady(port) {
  console.log(`\n  ${bold("featherlab is ready")}`);
  console.log(`  ${SYMBOLS.arrow} ${cyan(`http://127.0.0.1:${port}`)}`);
  console.log(`  Press ${bold("Ctrl+C")} to stop.\n`);
}

/**
 * Print the startup banner.
 */
export function printBanner(version) {
  console.log(`featherlab ${dim(`v${version}`)}  starting...`);
}
