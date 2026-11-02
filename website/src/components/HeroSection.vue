<template>
  <section id="hero" class="hero section">
    <div class="page-container hero-inner">
      <div class="hero-content">
        <p class="eyebrow">Kubernetes · Local · Free</p>
        <h1 class="hero-headline">Practice Kubernetes<br />on a real cluster.</h1>
        <p class="hero-subline">
          FeatherLab runs a <code>kind</code> cluster on your machine, presents guided labs in your
          browser, and grades your work against actual Kubernetes state — not the commands you
          typed.
        </p>
        <div class="hero-install">
          <div class="install-block">
            <code class="install-cmd">npm install -g featherlab</code>
            <CopyButton text="npm install -g featherlab" />
          </div>
        </div>
        <div class="hero-ctas">
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

      <div class="hero-frame-wrap">
        <div class="hero-bloom" aria-hidden="true"></div>
        <div class="hero-frame" aria-hidden="true">
          <img
            :src="workspaceImg"
            alt=""
            class="hero-screenshot"
            width="1400"
            height="860"
            loading="eager"
            decoding="sync"
          />
          <!-- Terminal overlay: static final state from k8s-0001 smoke test -->
          <div class="hero-terminal-overlay">
            <span class="tline prompt"
              ><span class="tprompt">learner@fe9c492933f6:~$</span> kubectl run web
              --image=nginx:1.27 -n fl-k8s-0001</span
            >
            <span class="tline">pod/web created</span>
            <span class="tline prompt"
              ><span class="tprompt">learner@fe9c492933f6:~$</span> kubectl get pods -n
              fl-k8s-0001</span
            >
            <span class="tline thead"
              >NAME&nbsp;&nbsp; READY&nbsp; STATUS&nbsp;&nbsp;&nbsp; RESTARTS&nbsp; AGE</span
            >
            <span class="tline"
              >web&nbsp;&nbsp;&nbsp; 1/1&nbsp;&nbsp;&nbsp;
              <span class="tgreen">Running</span>&nbsp;&nbsp;
              0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 12s</span
            >
            <span class="tline prompt tblank"
              ><span class="tprompt">learner@fe9c492933f6:~$</span>
              <span class="cursor">█</span></span
            >
          </div>
          <p class="hero-terminal-label">Terminal illustrated · your cluster is real</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import workspaceImg from "../assets/screenshots/workspace.png";
import CopyButton from "./CopyButton.vue";
</script>

<style scoped lang="scss">
.hero {
  padding-top: calc(var(--nav-height) + clamp(60px, 8vw, 100px));
  padding-bottom: clamp(60px, 8vw, 100px);
  overflow: hidden;
}

.hero-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 56px;
}

.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
  max-width: 720px;
}

.hero-headline {
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: var(--text-primary);
}

.hero-subline {
  font-size: clamp(1rem, 1.8vw, 1.1875rem);
  color: var(--text-secondary);
  line-height: 1.75;
  max-width: 58ch;

  code {
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.9em;
    color: var(--accent);
  }
}

.hero-install {
  width: 100%;
  max-width: 480px;
}

.install-block {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  font-size: 0.9375rem;
}

.install-cmd {
  flex: 1;
  text-align: left;
  color: var(--accent);
  font-size: 0.9375rem;
}

.hero-ctas {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
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

// Frame

.hero-frame-wrap {
  position: relative;
  width: 100%;
  max-width: 960px;
}

.hero-bloom {
  position: absolute;
  inset: -40px -60px;
  background: radial-gradient(
    ellipse 60% 50% at 50% 60%,
    rgba(74, 124, 124, 0.18) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.hero-frame {
  position: relative;
  container-type: inline-size;
  border-radius: var(--radius-xl);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-frame);
  z-index: 1;
  aspect-ratio: 1400 / 860;
}

.hero-screenshot {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
}

.hero-terminal-overlay {
  position: absolute;
  top: 11%;
  left: 52.5%;
  width: 46%;
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  font-family: var(--font-mono);
  font-size: 0.95cqw;
  line-height: 1.55;
  color: var(--terminal-fg);
  background: var(--terminal-bg);
  padding: 8px 10px;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
}

.tline {
  display: block;
  white-space: pre;
}

.tprompt {
  color: var(--accent);
}

.tgreen {
  color: var(--color-success);
}

.thead {
  color: var(--terminal-muted);
}

.cursor {
  animation: blink 1.1s step-end infinite;
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
  .cursor {
    animation: none;
  }
}

.hero-terminal-label {
  position: absolute;
  bottom: 10px;
  right: 14px;
  font-size: 0.65rem;
  color: var(--terminal-muted);
  pointer-events: none;
  user-select: none;
}

@media (max-width: 400px) {
  .hero-terminal-overlay {
    display: none;
  }
}
</style>
