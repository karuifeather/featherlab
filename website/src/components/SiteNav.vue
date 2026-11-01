<template>
  <nav class="nav" aria-label="Site navigation">
    <div class="nav-inner page-container">
      <a href="#main-content" class="nav-logo" aria-label="FeatherLab — back to top">
        <span class="nav-mark" aria-hidden="true">✦</span>
        <span class="nav-name">featherlab</span>
      </a>
      <div class="nav-links">
        <a
          href="https://github.com/karuifeather/featherlab"
          class="nav-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View FeatherLab on GitHub (opens in new tab)"
        >
          GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/featherlab"
          class="nav-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View featherlab on npm (opens in new tab)"
        >
          npm
        </a>
        <a href="#getting-started" class="nav-cta">Get started</a>
      </div>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--nav-height);
  background: rgba(13, 14, 16, 0.85);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.nav-inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.nav-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-left: -8px;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);

  &:hover {
    background: var(--surface-2);
  }
}

.nav-mark {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 11px;
}

.nav-name {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);

  &:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }
}

.nav-cta {
  padding: 7px 16px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-out);
  margin-left: 4px;

  &:hover {
    background: var(--primary-hover);
  }
}

@media (max-width: 480px) {
  .nav-link {
    display: none;
  }
}
</style>
