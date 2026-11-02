<template>
  <section id="faq" class="section faq-section">
    <div class="page-container">
      <header class="faq-header">
        <p class="eyebrow">Common questions</p>
        <h2 class="section-heading">Frequently asked questions</h2>
      </header>

      <dl class="faq-list">
        <div v-for="item in FAQS" :key="item.q" class="faq-item">
          <dt class="faq-q">{{ item.q }}</dt>
          <dd class="faq-a" v-html="item.a"></dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
const FAQS = [
  {
    q: "Is FeatherLab free?",
    a: "Yes. FeatherLab is completely free and MIT-licensed. Install it with <code>npm install -g featherlab</code> at no cost — no cloud account, no subscription, no credit card required.",
  },
  {
    q: "What Kubernetes topics can I practice?",
    a: "Current labs cover pods, deployments, ConfigMaps and Secrets, health checks, resource management and scheduling, Services and DNS, Ingress, Gateway API, and NetworkPolicy — over 170 exercises across 8 levels. The roadmap continues with RBAC, storage, Helm, and CKA, CKAD, and CKS exam readiness.",
  },
  {
    q: "Do I need a cloud account?",
    a: "No. FeatherLab runs a real <a href=\"https://kind.sigs.k8s.io/\" target=\"_blank\" rel=\"noopener noreferrer\">kind</a> (Kubernetes in Docker) cluster entirely on your own machine. You need Docker and Node.js — no cloud provider or account required.",
  },
  {
    q: "Is FeatherLab open source?",
    a: "Yes. Source code is on <a href=\"https://github.com/karuifeather/featherlab\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub</a> under the MIT license. Contributions are welcome.",
  },
  {
    q: "What certifications does FeatherLab help prepare for?",
    a: "The curriculum is being developed toward CKA, CKAD, CKS, KCNA, and KCSA coverage. FeatherLab is not affiliated with or endorsed by the CNCF.",
  },
];
</script>

<style scoped lang="scss">
.faq-section {
  border-top: 1px solid var(--border-subtle);
}

.faq-header {
  max-width: 640px;
  margin-bottom: 48px;
}

.faq-list {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.faq-item {
  border-top: 1px solid var(--border-subtle);
  padding: 24px 0;

  &:last-child {
    border-bottom: 1px solid var(--border-subtle);
  }
}

.faq-q {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.faq-a {
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.7;

  :deep(code) {
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.9em;
    color: var(--accent);
  }

  :deep(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
      color: var(--text-primary);
    }
  }
}
</style>
