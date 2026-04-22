export async function fetchJsonWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Model request timed out');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
