// `featherlab exercises` — list all available exercises with level and difficulty.

import { createApp } from "../../app.mjs";

/**
 * @param {object} _ctx  unused
 */
export function run() {
  for (const e of createApp().service.list())
    console.log(`${e.id}  L${e.level}  ${e.difficulty.padEnd(12)} ${e.title}`);
}
