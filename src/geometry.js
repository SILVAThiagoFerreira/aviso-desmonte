export function allPoints(entities = []) {
  return entities.flatMap((entity) => entity.points || []);
}

export function boundsOf(entities = []) {
  const points = allPoints(entities);
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function mergeBounds(boundsList = []) {
  const valid = boundsList.filter(Boolean);
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map((bounds) => bounds.minX)),
    minY: Math.min(...valid.map((bounds) => bounds.minY)),
    maxX: Math.max(...valid.map((bounds) => bounds.maxX)),
    maxY: Math.max(...valid.map((bounds) => bounds.maxY))
  };
}

export function paddedBounds(bounds, ratio = 0.08) {
  if (!bounds) return null;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const pad = Math.max(width, height) * ratio;
  return { minX: bounds.minX - pad, minY: bounds.minY - pad, maxX: bounds.maxX + pad, maxY: bounds.maxY + pad };
}

export function getStringEndpoints(entities = []) {
  const endpoints = [];
  entities.forEach((entity) => {
    const points = entity.points || [];
    if (entity.type === 'circle') return;
    if (points.length === 1) endpoints.push(points[0]);
    if (points.length >= 2) {
      endpoints.push(points[0]);
      endpoints.push(points[points.length - 1]);
    }
  });
  const scale = Math.max(boundsOf(entities)?.maxX - (boundsOf(entities)?.minX || 0), 1);
  const tolerance = scale * 1e-7;
  return endpoints.filter((point, index) => endpoints.findIndex((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance) === index);
}

export function formatNumber(value, fractionDigits = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 }).format(value);
}
