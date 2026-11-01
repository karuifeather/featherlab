<template>
  <footer class="footer">
    <div class="page-container footer-inner">
      <div class="footer-brand">
        <span class="footer-mark" aria-hidden="true">✦</span>
        <span class="footer-name">featherlab</span>
      </div>
      <div class="footer-meta">
        <span>MIT License</span>
        <span class="footer-sep" aria-hidden="true">·</span>
        <a
          href="https://karuifeather.com"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-link"
        >
          karuifeather.com
        </a>
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  border-top: 1px solid var(--border-subtle);
  padding-block: 28px;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 7px;
}

.footer-mark {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 9px;
}

.footer-name {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.footer-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.footer-sep {
  color: var(--border-default);
}

.footer-link {
  color: var(--text-muted);
  transition: color var(--dur-fast) var(--ease-out);

  &:hover {
    color: var(--text-primary);
  }
}
</style>
