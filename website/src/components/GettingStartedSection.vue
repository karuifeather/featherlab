<template>
  <section id="getting-started" class="section getting-started-section">
    <div class="page-container">
      <header class="gs-header">
        <p class="eyebrow">Quick start</p>
        <h2 class="section-heading">Up and running in three commands.</h2>
        <p class="section-lead">
          FeatherLab is an npm package. Install it globally, verify prerequisites, and launch.
        </p>
      </header>

      <div class="gs-layout">
        <div class="prereqs">
          <h3 class="prereqs-heading">Before you start</h3>
          <ul class="prereqs-list">
            <li v-for="req in PREREQS" :key="req.label" class="prereq-item">
              <span class="prereq-icon" aria-hidden="true">◆</span>
              <div>
                <span class="prereq-label">{{ req.label }}</span>
                <span v-if="req.note" class="prereq-note"> — {{ req.note }}</span>
              </div>
            </li>
          </ul>
          <p class="prereqs-internet">
            Internet access is needed on first launch to pull the kind node image and workstation
            container. Most subsequent use works offline once images are cached.
          </p>
        </div>

        <div class="commands">
          <div v-for="(step, i) in STEPS" :key="i" class="command-block">
            <div class="command-meta">
              <span class="command-num">{{ String(i + 1).padStart(2, "0") }}</span>
              <div class="command-info">
                <span class="command-title">{{ step.title }}</span>
                <span class="command-desc">{{ step.description }}</span>
              </div>
            </div>
            <div class="command-row">
              <code class="command-code">{{ step.command }}</code>
              <CopyButton :text="step.command" />
            </div>
          </div>
          <p class="command-note">Opens at <code>http://127.0.0.1:4317</code>.</p>
        </div>
      </div>

      <!-- Closing CTAs -->
      <div class="gs-ctas">
        <a
          href="https://github.com/karuifeather/featherlab"
          class="cta-primary"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/featherlab"
          class="cta-secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          npm package
        </a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import CopyButton from "./CopyButton.vue";

const PREREQS = [
  {
    label: "Linux",
    note: "macOS is exploratory but not regularly tested; Windows and WSL2 are not validated",
  },
  { label: "Node.js 22.14 or later", note: undefined },
  { label: "Docker Engine", note: "docker info should succeed without sudo" },
  { label: "kind CLI", note: "version 0.33.0 recommended" },
];

const STEPS = [
  {
    title: "Install",
    description: "Install the featherlab CLI globally from npm.",
    command: "npm install -g featherlab",
  },
  {
    title: "Check prerequisites",
    description: "Verifies Docker and kind are reachable.",
    command: "featherlab doctor",
  },
  {
    title: "Launch",
    description: "Creates the kind cluster on first run, starts the browser workspace.",
    command: "featherlab",
  },
];
</script>

<style scoped lang="scss">
.gs-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: clamp(36px, 5vw, 56px);
}

.gs-layout {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 48px;
  align-items: start;
  margin-bottom: 48px;
}

// Prerequisites
.prereqs {
  padding: 28px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.prereqs-heading {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.prereqs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.prereq-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 0.875rem;
}

.prereq-icon {
  color: var(--accent);
  font-size: 0.6rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.prereq-label {
  font-weight: 500;
  color: var(--text-primary);
}

.prereq-note {
  color: var(--text-muted);
}

.prereqs-internet {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.6;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

// Commands
.commands {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.command-block {
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.command-meta {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px 12px;
}

.command-num {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-muted);
  padding-top: 2px;
  flex-shrink: 0;
}

.command-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.command-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.command-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.command-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 16px;
  background: var(--surface-2);
  border-top: 1px solid var(--border-subtle);
}

.command-code {
  flex: 1;
  font-size: 0.9375rem;
  color: var(--accent);
  font-family: var(--font-mono);
}

.command-note {
  font-size: 0.8125rem;
  color: var(--text-muted);

  code {
    font-size: 0.9em;
    color: var(--text-secondary);
    background: var(--surface-2);
    border-radius: 4px;
    padding: 1px 5px;
  }
}

// Closing CTAs
.gs-ctas {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cta-primary {
  padding: 10px 24px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-out);

  &:hover {
    background: var(--primary-hover);
  }
}

.cta-secondary {
  padding: 9px 24px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);

  &:hover {
    background: var(--surface-2);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }
}

@media (max-width: 768px) {
  .gs-layout {
    grid-template-columns: 1fr;
  }
}
</style>
