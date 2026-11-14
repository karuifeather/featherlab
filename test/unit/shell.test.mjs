import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHELL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docker/shell.sh");

// The stock Debian prompt, as ~/.bashrc leaves it: `\u@\h` in the window title and the prompt.
const STOCK_PS1 = String.raw`\[\e]0;\u@\h: \w\a\]\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ `;

/** Runs `script` in an interactive bash that sourced shell.sh, with an isolated HOME so the
 * real ~/.featherlab_aliases and history are never read or written. */
function interactive(script) {
  const home = mkdtempSync(path.join(os.tmpdir(), "fl-shell-"));
  try {
    return spawnSync("bash", ["--norc", "--noprofile", "-i", "-c", script, "bash", SHELL], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: home,
        HISTFILE: path.join(home, "history"),
        FEATHERLAB_ALIAS_FILE: path.join(home, "aliases"),
        STOCK_PS1,
      },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("the first prompt drops the host from the rc files' PS1", () => {
  const out = interactive('. "$1"; PS1=$STOCK_PS1; __fl_prompt; printf "%s" "$PS1"');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, STOCK_PS1.replaceAll(String.raw`@\h`, ""));
  assert.ok(out.stdout.includes(String.raw`\u\[\033[00m\]:`));
});

test("a prompt the learner sets later keeps its host", () => {
  const out = interactive(
    String.raw`. "$1"; PS1=$STOCK_PS1; __fl_prompt; PS1='\u@\h:\w\$ '; __fl_prompt; printf "%s" "$PS1"`,
  );
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, String.raw`\u@\h:\w\$ `);
});

test("the prompt hook preserves the last command's exit status", () => {
  const out = interactive('. "$1"; (exit 7); __fl_prompt; printf "%s" "$?"');
  assert.equal(out.stdout, "7");
});
