// `featherlab validate-content [dir]` — validate exercise and knowledge-check definitions offline.
// No Docker required; safe to run in CI.

import { validateContent, validateKnowledgeChecks } from "../../app.mjs";

/**
 * @param {{ cmdArgs: string[] }} ctx
 */
export function run({ cmdArgs }) {
  const dir = cmdArgs[1] && !cmdArgs[1].startsWith("-") ? cmdArgs[1] : undefined;

  const result = validateContent({ contentRoot: dir });
  if (!result.ok) {
    console.error("Invalid exercise content:");
    for (const p of result.problems)
      console.error(`  - ${p.file}${p.path ? ` [${p.path}]` : ""}: ${p.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Validated ${result.count} exercise${result.count === 1 ? "" : "s"}: OK`);
  }

  const kcResult = validateKnowledgeChecks({ contentRoot: dir });
  if (!kcResult.ok) {
    console.error("Invalid knowledge-check content:");
    for (const p of kcResult.problems)
      console.error(`  - ${p.file}${p.path ? ` [${p.path}]` : ""}: ${p.message}`);
    process.exitCode = 1;
  } else if (kcResult.count > 0) {
    console.log(
      `Validated ${kcResult.count} knowledge check${kcResult.count === 1 ? "" : "s"}: OK`,
    );
  }
}
