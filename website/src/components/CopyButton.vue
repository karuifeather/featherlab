<template>
  <button
    type="button"
    class="copy-btn"
    :aria-label="copied ? 'Copied to clipboard' : `Copy: ${text}`"
    @click="copy"
  >
    <span class="copy-icon" aria-hidden="true">{{ copied ? "✓" : "⎘" }}</span>
    <span class="copy-label">{{ copied ? "Copied" : "Copy" }}</span>
    <span aria-live="polite" class="sr-only">{{ copied ? "Copied to clipboard" : "" }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ text: string }>();
const copied = ref(false);

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard API unavailable; silently do nothing
  }
}
</script>

<style scoped lang="scss">
.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-family: var(--font-sans);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
  white-space: nowrap;

  &:hover {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }
}

.copy-icon {
  font-size: 0.875rem;
}
</style>
