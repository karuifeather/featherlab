# FeatherLab Website

Landing page for [FeatherLab](https://github.com/karuifeather/featherlab), built with Vue 3, TypeScript, Vite, and SCSS.

## Development

```bash
cd website
npm install
npm run dev       # dev server at http://localhost:5173/featherlab/
npm run build     # type-check + production build → dist/
npm run preview   # serve the dist/ at http://localhost:4173/featherlab/
```

The `base` path defaults to `/featherlab/`. To preview with a custom path, set `VITE_BASE_PATH`:

```bash
VITE_BASE_PATH=/my-path npm run preview
```

## Deployment

The site deploys to GitHub Pages via `.github/workflows/website.yml` on pushes to `main` that
touch `website/**` or the workflow file.

### One-time setup

1. Go to **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment**, set Source to **GitHub Actions**.
3. Save. The next push matching the path filter will trigger a deploy.
