<template>
  <section id="curriculum" class="section curriculum-section">
    <div class="page-container">
      <header class="curriculum-header">
        <p class="eyebrow">What you can learn</p>
        <h2 class="section-heading">
          {{ TOTAL_EXERCISES }} exercises across {{ IMPLEMENTED_LEVELS.length }} levels —
          foundations to NetworkPolicy.
        </h2>
        <p class="section-lead">
          Each level introduces one concept at a time, then applies it, then breaks it on purpose.
          Guided labs, independent exercises, troubleshooting challenges, and mastery activities are
          interleaved with knowledge checks throughout each level.
        </p>
      </header>

      <!-- Implemented levels: 4×2 grid -->
      <div class="levels-grid" aria-label="Implemented curriculum levels">
        <article
          v-for="level in IMPLEMENTED_LEVELS"
          :key="level.number"
          class="level-tile"
          :style="`--level-hue: ${levelHue(level.number)}`"
        >
          <div class="level-num">Level {{ level.number }}</div>
          <h3 class="level-theme">{{ level.theme }}</h3>
          <div class="level-counts">
            <span class="level-count">{{ level.exerciseCount }} exercises</span>
            <span class="level-sep" aria-hidden="true">·</span>
            <span class="level-count">{{ level.checkCount }} knowledge checks</span>
          </div>
        </article>
      </div>

      <!-- Planned groups -->
      <div class="planned-section" aria-label="Planned curriculum levels">
        <p class="planned-label">In development</p>
        <div class="planned-grid">
          <div v-for="group in PLANNED_GROUPS" :key="group.range" class="planned-tile">
            <div class="planned-range">{{ group.label }}</div>
            <div class="planned-desc">{{ group.description }}</div>
          </div>
        </div>
      </div>

      <p class="curriculum-disclaimer">
        FeatherLab is being developed toward CKA, CKAD, CKS, KCNA, and KCSA coverage. Not affiliated
        with or endorsed by the CNCF.
      </p>

      <!-- Open-source references -->
      <div class="credits-block">
        <p class="credits-heading">Curriculum references</p>
        <p class="credits-note">
          Topic coverage only — no exercise text, manifests, or questions reproduced.
        </p>
        <ul class="credits-list">
          <li v-for="ref in CREDITS" :key="ref.url">
            <a :href="ref.url" target="_blank" rel="noopener noreferrer" class="credits-link">
              {{ ref.name }}
            </a>
            <span class="credits-license">({{ ref.license }})</span>
            <span class="credits-use">— {{ ref.use }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IMPLEMENTED_LEVELS, PLANNED_GROUPS, TOTAL_EXERCISES } from "../data/curriculum";

const CREDITS = [
  {
    name: "dgkanatsios/CKAD-exercises",
    url: "https://github.com/dgkanatsios/CKAD-exercises",
    license: "MIT",
    use: "topic list",
  },
  {
    name: "jayendrapatil/kubernetes-exercises",
    url: "https://github.com/jayendrapatil/kubernetes-exercises",
    license: "MIT",
    use: "topic list",
  },
  {
    name: "theplatformlab/CKA-Certified-Kubernetes-Administrator",
    url: "https://github.com/theplatformlab/CKA-Certified-Kubernetes-Administrator",
    license: "MIT",
    use: "domain structure",
  },
];

// Deterministic accent hue per level (teal spectrum, 160–220)
function levelHue(n: number): number {
  return 160 + (n / 7) * 40;
}
</script>

<style scoped lang="scss">
.curriculum-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: clamp(36px, 5vw, 56px);
}

// Levels grid: 4×2 on desktop
.levels-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}

.level-tile {
  padding: 20px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 2px solid hsl(var(--level-hue), 35%, 38%);
  transition: border-color var(--dur-base) var(--ease-out);

  &:hover {
    border-color: var(--border-strong);
    border-top-color: hsl(var(--level-hue), 45%, 50%);
  }
}

.level-num {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--level-hue), 45%, 58%);
}

.level-theme {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.level-counts {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.level-count {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.level-sep {
  color: var(--border-default);
}

// Planned levels
.planned-section {
  margin-bottom: 32px;
}

.planned-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.planned-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.planned-tile {
  padding: 14px 16px;
  background: transparent;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  opacity: 0.65;
}

.planned-range {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.planned-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.curriculum-disclaimer {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-bottom: 40px;
}

// Credits
.credits-block {
  padding: 24px 28px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.credits-heading {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.credits-note {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.credits-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credits-link {
  font-size: 0.8125rem;
  color: var(--accent);

  &:hover {
    text-decoration: underline;
  }
}

.credits-license {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0 4px;
}

.credits-use {
  font-size: 0.75rem;
  color: var(--text-muted);
}

// Responsive
@media (max-width: 900px) {
  .levels-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .planned-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 560px) {
  .levels-grid {
    grid-template-columns: 1fr;
  }

  .planned-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
