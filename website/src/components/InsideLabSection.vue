<template>
  <section id="inside-a-lab" class="section inside-lab">
    <div class="page-container">
      <header class="lab-header">
        <p class="eyebrow">The experience</p>
        <h2 class="section-heading">Inside a lab</h2>
        <p class="section-lead">
          Every FeatherLab exercise follows the same five steps — from browsing the curriculum to
          unlocking the next challenge.
        </p>
      </header>

      <!-- Desktop: sticky nav + scrolling stages -->
      <div class="lab-layout">
        <aside class="lab-nav" aria-label="Lab stage navigation">
          <ol class="stage-nav-list">
            <li
              v-for="(stage, i) in stages"
              :key="i"
              class="stage-nav-item"
              :class="{ active: activeStage === i }"
            >
              <button
                type="button"
                class="stage-nav-btn"
                :aria-current="activeStage === i ? 'step' : undefined"
                @click="scrollToStage(i)"
              >
                <span class="stage-num">{{ String(i + 1).padStart(2, "0") }}</span>
                <span class="stage-label">{{ stage.label }}</span>
              </button>
            </li>
          </ol>
        </aside>

        <div class="lab-stages" ref="stagesWrap">
          <div
            v-for="(stage, i) in stages"
            :key="i"
            class="lab-stage"
            :ref="(el) => setStageRef(el, i)"
          >
            <div class="stage-content">
              <div class="stage-meta">
                <span class="stage-step">Step {{ i + 1 }}</span>
                <h3 class="stage-title">{{ stage.title }}</h3>
                <p class="stage-desc">{{ stage.description }}</p>
              </div>
              <div class="stage-visual">
                <template v-if="stage.image">
                  <div v-if="stage.cropStyle === 'center-panel'" class="stage-crop-center">
                    <img
                      :src="stage.image"
                      :alt="stage.imageAlt"
                      class="stage-screenshot"
                      loading="lazy"
                      decoding="async"
                      width="1400"
                      height="860"
                    />
                  </div>
                  <img
                    v-else
                    :src="stage.image"
                    :alt="stage.imageAlt"
                    class="stage-screenshot"
                    :style="stage.crop ? `object-position: ${stage.crop}` : undefined"
                    loading="lazy"
                    decoding="async"
                    width="1400"
                    height="860"
                  />
                </template>
                <TerminalAnimation v-else-if="stage.terminal" />
                <div v-else-if="stage.completion" class="stage-completion">
                  <div class="completion-badge">Exercise completed</div>
                  <div class="next-btn">
                    Next: Kubernetes Basics <span aria-hidden="true">→</span>
                  </div>
                  <p class="next-note">
                    Opens in a fresh environment: this exercise's cluster resources are reset. Your
                    completion stays saved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import TerminalAnimation from "./TerminalAnimation.vue";
import launcherImg from "../assets/screenshots/launcher.png";
import workspaceImg from "../assets/screenshots/workspace.png";
import gradingImg from "../assets/screenshots/grading.png";

interface Stage {
  label: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  crop?: string;
  cropStyle?: "center-panel";
  terminal?: true;
  completion?: true;
}

const stages: Stage[] = [
  {
    label: "Browse curriculum",
    title: "Open the launcher, pick an exercise.",
    description:
      "The launcher shows your progress across all eight levels. Completed exercises stay unlocked; prerequisites gate the next challenge. Resume where you left off.",
    image: launcherImg,
    imageAlt: "FeatherLab launcher showing levels 0–7 with progress tracking",
    crop: "top center",
  },
  {
    label: "Read the scenario",
    title: "Read the scenario and requirements.",
    description:
      'Each exercise opens with a short scenario, a requirements checklist, and optional hints. For "Your first Pod": create a Pod named web running nginx:1.27 in namespace fl-k8s-0001.',
    image: workspaceImg,
    imageAlt: "Exercise workspace showing the scenario panel and requirements checklist",
    crop: "0% 15%",
  },
  {
    label: "Work in the terminal",
    title: "Work in the integrated terminal.",
    description:
      "The terminal is a real shell inside a workstation container joined to your practice cluster. Run kubectl, edit YAML, inspect events — whatever it takes.",
    terminal: true,
  },
  {
    label: "Check your work",
    title: "Each check reports what it found.",
    description:
      'FeatherLab inspects actual cluster state: does the Pod exist, is the image right, is the phase Running, is the Ready condition True? Each check tells you what it found — not just "wrong".',
    image: gradingImg,
    imageAlt: "Grading results showing 4/4 checks passed with individual check feedback",
    crop: "bottom center",
  },
  {
    label: "Keep going",
    title: "Completion unlocks the next exercise.",
    description:
      "Progress is stored locally in SQLite and survives restarts. Completing an exercise unlocks what follows. Move on when you're ready.",
    completion: true,
  },
];

const activeStage = ref(0);
const stagesWrap = ref<HTMLElement | null>(null);
const stageRefs = ref<(Element | null)[]>([]);
let observer: IntersectionObserver | null = null;

function setStageRef(el: Element | ComponentPublicInstance | null, i: number): void {
  stageRefs.value[i] = el instanceof Element ? el : null;
}

function scrollToStage(i: number): void {
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
  stageRefs.value[i]?.scrollIntoView({ behavior, block: "start" });
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = stageRefs.value.indexOf(entry.target);
          if (idx !== -1) activeStage.value = idx;
        }
      }
    },
    { threshold: 0.4 },
  );
  stageRefs.value.forEach((el) => el && observer!.observe(el));
});

onUnmounted(() => {
  observer?.disconnect();
});

// Vue exposes this type via defineComponent; in script setup we need to import it
import type { ComponentPublicInstance } from "vue";
</script>

<style scoped lang="scss">
.inside-lab {
  background: var(--surface-1);
}

.lab-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: clamp(40px, 6vw, 72px);
}

.lab-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 48px;
  align-items: start;
}

// Sticky nav
.lab-nav {
  position: sticky;
  top: calc(var(--nav-height) + 24px);
  min-width: 0;
}

.stage-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stage-nav-item {
  position: relative;

  &::before {
    content: "";
    position: absolute;
    left: 15px;
    top: 100%;
    width: 1px;
    height: 4px;
    background: var(--border-default);
  }

  &:last-child::before {
    display: none;
  }

  &.active .stage-nav-btn {
    color: var(--text-primary);
    background: var(--surface-2);

    .stage-num {
      color: var(--accent);
    }
  }
}

.stage-nav-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 0.8125rem;
  text-align: left;
  transition:
    color var(--dur-base) var(--ease-out),
    background var(--dur-base) var(--ease-out);

  &:hover {
    color: var(--text-secondary);
    background: var(--surface-2);
  }
}

.stage-num {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.stage-label {
  line-height: 1.3;
}

// Stages

.lab-stages {
  display: flex;
  flex-direction: column;
  gap: 80px;
  min-width: 0;
}

.lab-stage {
  scroll-margin-top: calc(var(--nav-height) + 40px);
}

.stage-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.stage-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-step {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.stage-title {
  font-size: clamp(1.25rem, 2.5vw, 1.625rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.stage-desc {
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 58ch;
}

.stage-visual {
  border-radius: var(--radius-lg);
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-2);
}

.stage-screenshot {
  width: 100%;
  min-width: 0;
  height: auto;
  aspect-ratio: 1400 / 520;
  object-fit: cover;
  display: block;
}

.stage-crop-center {
  overflow: hidden;
  aspect-ratio: 500 / 360;

  .stage-screenshot {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    object-fit: cover;
    object-position: 0% 15%;
  }
}

// Completion stage
.stage-completion {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px 28px;
  background: var(--surface-2);
}

.completion-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  background: rgba(95, 191, 138, 0.12);
  border: 1px solid rgba(95, 191, 138, 0.3);
  border-radius: var(--radius-pill);
  color: var(--color-success);
  font-size: 0.875rem;
  font-weight: 500;
  width: fit-content;

  &::before {
    content: "✓";
  }
}

.next-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  font-weight: 500;
  width: fit-content;
  user-select: none;
}

.next-note {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 52ch;
}

// Mobile: stack nav above stages
@media (max-width: 768px) {
  .lab-layout {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .lab-nav {
    position: static;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .stage-nav-list {
    flex-direction: row;
    gap: 4px;
    min-width: max-content;
  }

  .stage-nav-item::before {
    display: none;
  }

  .stage-nav-btn {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 12px;
    min-width: 110px;
  }
}
</style>
