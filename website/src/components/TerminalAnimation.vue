<template>
  <!-- aria-hidden: the static transcript below this element serves screen readers -->
  <div class="term-wrap" aria-hidden="true">
    <div class="term-chrome">
      <span class="term-dot"></span>
      <span class="term-dot"></span>
      <span class="term-dot"></span>
      <span class="term-title">bash · kubectl</span>
      <span class="term-status">● Connected</span>
    </div>
    <div class="term-body">
      <div class="term-lines" ref="linesEl">
        <span v-for="(line, i) in visibleLines" :key="i" class="term-line">
          <template v-if="line.type === 'prompt'">
            <span class="term-prompt">learner@fe9c492933f6:~$</span>
            {{ " " }}
            <span :class="{ 'term-typing': i === visibleLines.length - 1 && isTyping }">{{
              line.text
            }}</span><span
              v-if="i === visibleLines.length - 1 && showCursor && !isTyping"
              class="term-cursor"
            >█</span>
          </template>
          <template v-else-if="line.type === 'header'">
            <span class="term-muted">{{ line.text }}</span>
          </template>
          <template v-else-if="line.type === 'running'">
            {{ line.prefix }}<span class="term-success">Running</span>{{ line.suffix }}
          </template>
          <template v-else>{{ line.text }}</template>
        </span>
        <span
          v-if="showCursor && visibleLines[visibleLines.length - 1]?.type !== 'prompt'"
          class="term-cursor"
        >█</span>
      </div>
    </div>
    <p class="term-caption">Illustration — the real terminal connects to your cluster</p>
  </div>
  <p class="sr-only">
    Terminal session: kubectl run web --image=nginx:1.27 -n fl-k8s-0001 — pod/web created — kubectl
    get pods -n fl-k8s-0001 — NAME READY STATUS RESTARTS AGE — web 1/1 Running 0 12s
  </p>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

interface Line {
  type: "prompt" | "output" | "header" | "running";
  text?: string;
  prefix?: string;
  suffix?: string;
}

const SCRIPT: Array<{ line: Line; delayAfter: number }> = [
  {
    line: { type: "prompt", text: "kubectl run web --image=nginx:1.27 -n fl-k8s-0001" },
    delayAfter: 600,
  },
  { line: { type: "output", text: "pod/web created" }, delayAfter: 800 },
  {
    line: {
      type: "prompt",
      text: "kubectl get pods -n fl-k8s-0001",
    },
    delayAfter: 500,
  },
  {
    line: { type: "header", text: "NAME    READY   STATUS    RESTARTS   AGE" },
    delayAfter: 120,
  },
  {
    line: {
      type: "running",
      prefix: "web     1/1     ",
      suffix: "   0          12s",
    },
    delayAfter: 300,
  },
  { line: { type: "prompt", text: "" }, delayAfter: 1600 },
];

const linesEl = ref<HTMLElement | null>(null);
const visibleLines = ref<Line[]>([]);
const isTyping = ref(false);
const showCursor = ref(true);

let timers: ReturnType<typeof setTimeout>[] = [];

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function showAll(): void {
  visibleLines.value = SCRIPT.map((s) => s.line);
  isTyping.value = false;
  showCursor.value = true;
}

async function runAnimation(): Promise<void> {
  if (prefersReducedMotion()) {
    showAll();
    return;
  }

  for (let i = 0; i < SCRIPT.length; i++) {
    const { line, delayAfter } = SCRIPT[i];

    if (line.type === "prompt" && line.text) {
      visibleLines.value = [...visibleLines.value, { type: "prompt", text: "" }];
      isTyping.value = true;
      showCursor.value = false;

      await typeText(line.text, (partial) => {
        const lines = [...visibleLines.value];
        lines[lines.length - 1] = { type: "prompt", text: partial };
        visibleLines.value = lines;
      });

      isTyping.value = false;
    } else {
      await delay(80);
      visibleLines.value = [...visibleLines.value, line];
    }

    showCursor.value = true;
    await delay(delayAfter);
  }

  await delay(3000);
  visibleLines.value = [];
  showCursor.value = false;
  await delay(600);
  runAnimation();
}

function typeText(text: string, onUpdate: (partial: string) => void): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    function tick() {
      if (i > text.length) {
        resolve();
        return;
      }
      onUpdate(text.slice(0, i));
      i++;
      timers.push(setTimeout(tick, 28 + Math.random() * 24));
    }
    tick();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timers.push(setTimeout(resolve, ms));
  });
}

onMounted(() => {
  runAnimation();
});

onUnmounted(() => {
  timers.forEach(clearTimeout);
});
</script>

<style scoped lang="scss">
.term-wrap {
  background: var(--terminal-bg);
  border: 1px solid var(--terminal-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: clamp(0.75rem, 1.4vw, 0.875rem);
  line-height: 1.65;
  min-height: 260px;
}

.term-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--terminal-chrome);
  border-bottom: 1px solid var(--terminal-border);
}

.term-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-strong);
  flex-shrink: 0;
}

.term-title {
  font-size: 0.75rem;
  color: var(--terminal-muted);
  margin-left: 4px;
}

.term-status {
  margin-left: auto;
  font-size: 0.6875rem;
  color: var(--color-success);
}

.term-body {
  padding: 16px 18px;
  min-height: 210px;
  overflow: hidden;
}

.term-lines {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.term-line {
  display: block;
  white-space: pre;
}

.term-prompt {
  color: var(--accent);
  user-select: none;
}

.term-muted {
  color: var(--terminal-muted);
}

.term-success {
  color: var(--color-success);
}

.term-cursor {
  animation: blink 1s step-end infinite;
  color: var(--terminal-cursor);
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .term-cursor {
    animation: none;
  }
}

.term-caption {
  padding: 8px 18px 10px;
  font-size: 0.6875rem;
  color: var(--terminal-muted);
  font-family: var(--font-sans);
  border-top: 1px solid var(--terminal-border);
  font-style: italic;
}
</style>
