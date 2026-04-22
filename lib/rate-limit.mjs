const buckets = new Map();

export function checkRateLimit(key, { limit = 30, windowMs = 60_000, now = Date.now() } = {}) {
  const bucketKey = key || 'anonymous';
  const bucket = buckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs
    });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: bucket.resetAt - now
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count
  };
}
