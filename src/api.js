export async function sendChat(messages) {
  const startedAt = performance.now();
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages })
  });

  const data = await resp.json();
  return {
    ok: resp.ok,
    data,
    latencyMs: Math.round(performance.now() - startedAt)
  };
}
