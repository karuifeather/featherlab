<template>
  <section id="grading" class="section grading-section">
    <div class="page-container grading-inner">
      <div class="grading-copy">
        <p class="eyebrow">What makes it different</p>
        <h2 class="section-heading">Graded on cluster state,<br />not the commands you typed.</h2>
        <p class="section-lead">
          FeatherLab validates Kubernetes objects directly — it reads the Pod's phase, checks the
          image field, and evaluates every condition. Two different commands that produce the same
          result both pass. Each check reports exactly what it found, not just "wrong". Partial
          credit is tracked: a score of 3/4 tells you which condition still needs work.
        </p>
        <p class="section-lead" style="margin-top: 12px">
          If an infrastructure failure prevents a check from running, the outcome is
          <code>incomplete</code> — distinct from a wrong answer and never recorded as a failed
          attempt.
        </p>
      </div>

      <div class="grading-diagram" aria-label="Grading flow diagram" role="img">
        <div class="diag-node diag-kubectl">
          <span class="diag-icon">⌨</span>
          <span>kubectl</span>
        </div>
        <div class="diag-arrow" aria-hidden="true">→</div>
        <div class="diag-node diag-cluster">
          <span class="diag-icon">⎈</span>
          <span>cluster</span>
        </div>
        <div class="diag-arrow" aria-hidden="true">→</div>
        <div class="diag-node diag-validators">
          <span class="diag-icon">◈</span>
          <span>validators</span>
        </div>
        <div class="diag-arrow diag-arrow--down" aria-hidden="true">↓</div>
        <div class="diag-results">
          <div class="diag-result pass">✓ Pod exists in fl-k8s-0001</div>
          <div class="diag-result pass">✓ Container uses nginx:1.27</div>
          <div class="diag-result pass">✓ Pod is Running</div>
          <div class="diag-result pass">✓ Pod Ready condition is True</div>
        </div>
      </div>

      <dl class="fact-row">
        <div class="fact">
          <dt>No account required</dt>
          <dd>Runs entirely on your machine</dd>
        </div>
        <div class="fact">
          <dt>127.0.0.1 only</dt>
          <dd>Server never binds to a public address</dd>
        </div>
        <div class="fact">
          <dt>Progress in SQLite</dt>
          <dd>Stored locally in <code>~/.featherlab</code></dd>
        </div>
        <div class="fact">
          <dt>Resume safely</dt>
          <dd>Cluster and workstation survive <code>featherlab stop</code></dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped lang="scss">
.grading-inner {
  display: flex;
  flex-direction: column;
  gap: 48px;
}

.grading-copy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 680px;

  code {
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.88em;
    color: var(--accent);
  }
}

// Diagram
.grading-diagram {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 28px 32px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.diag-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 20px;
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 90px;
  text-align: center;
}

.diag-icon {
  font-size: 1.25rem;
  color: var(--accent);
}

.diag-kubectl .diag-icon {
  color: var(--text-secondary);
}

.diag-cluster .diag-icon {
  color: var(--primary);
}

.diag-validators .diag-icon {
  color: var(--accent);
}

.diag-arrow {
  font-size: 1.25rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.diag-arrow--down {
  align-self: stretch;
  display: flex;
  align-items: flex-end;
  padding-bottom: 4px;
}

.diag-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diag-result {
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  padding: 4px 10px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);

  &.pass {
    color: var(--color-success);
    background: rgba(95, 191, 138, 0.08);
  }
}

// Fact row
.fact-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.fact {
  padding: 18px 20px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);

  dt {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  dd {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.5;

    code {
      font-size: 0.85em;
      color: var(--accent);
      background: var(--surface-2);
      border-radius: 4px;
      padding: 1px 4px;
    }
  }
}

@media (max-width: 900px) {
  .fact-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .grading-diagram {
    padding: 20px;
    gap: 12px;
  }

  .fact-row {
    grid-template-columns: 1fr;
  }
}
</style>
