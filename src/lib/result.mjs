export const TASK = Object.freeze({
  id: 'k8s-0001',
  title: 'Your first Pod',
  name: 'web',
  namespace: 'default',
  image: 'nginx:1.27',
});

export function gradePod(pod) {
  const found = Boolean(pod && pod.metadata?.name === TASK.name && pod.metadata?.namespace === TASK.namespace);
  const checks = [
    { id: 'exists', label: 'Pod web exists in default namespace', pass: found },
    { id: 'image', label: 'Container uses nginx:1.27', pass: found && pod.spec?.containers?.some(c => c.image === TASK.image) === true },
    { id: 'running', label: 'Pod is Running', pass: found && pod.status?.phase === 'Running' },
    { id: 'ready', label: 'Pod Ready condition is True', pass: found && pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') === true },
  ];
  return { checks, passed: checks.filter(c => c.pass).length, total: checks.length, success: checks.every(c => c.pass) };
}
