export default {
  "**/*.{js,jsx,mjs,cjs,ts,tsx,vue}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "**/*.{json,jsonc,yaml,yml,md,css,scss,html}": ["prettier --write"],
};
