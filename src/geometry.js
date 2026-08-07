export function allPoints(entities = []) {
  return entities.flatMap((entity) => entity.points || []);
}

export function flattenStringEntities(strings = []) {
  return strings.flatMap((item) => item?.entities || item || []);
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
  const bounds = boundsOf(entities);
  const scale = Math.max((bounds?.maxX || 0) - (bounds?.minX || 0), 1);
  const tolerance = scale * 1e-7;
  return endpoints.filter((point, index) => endpoints.findIndex((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance) === index);
}

function pointKey(point) {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
}

function capsulePolygon(a, b, radius, steps = 16) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!length) return circlePolygon(a, radius, steps * 2);
  const nx = -dy / length;
  const ny = dx / length;
  const angle = Math.atan2(dy, dx);
  const ring = [];
  for (let index = 0; index <= steps; index += 1) {
    const theta = angle + Math.PI / 2 + Math.PI * index / steps;
    ring.push([a.x + radius * Math.cos(theta), a.y + radius * Math.sin(theta)]);
  }
  for (let index = 0; index <= steps; index += 1) {
    const theta = angle - Math.PI / 2 + Math.PI * index / steps;
    ring.push([b.x + radius * Math.cos(theta), b.y + radius * Math.sin(theta)]);
  }
  return [ring];
}

function circlePolygon(center, radius, steps = 32) {
  const ring = [];
  for (let index = 0; index < steps; index += 1) {
    const theta = Math.PI * 2 * index / steps;
    ring.push([center.x + radius * Math.cos(theta), center.y + radius * Math.sin(theta)]);
  }
  ring.push(ring[0]);
  return [ring];
}

function bufferPieces(entities, radius) {
  const pieces = [];
  const seen = new Set();
  entities.forEach((entity) => {
    const points = entity.points || [];
    if (!points.length) return;
    if (entity.type === 'circle') {
      const circleRadius = Math.max(Number(entity.radius) || 0, 0) + radius;
      if (circleRadius > 0) pieces.push(circlePolygon(points[0], circleRadius));
      return;
    }
    if (points.length === 1) {
      const key = `${pointKey(points[0])}:${radius}`;
      if (!seen.has(key)) pieces.push(circlePolygon(points[0], radius));
      seen.add(key);
      return;
    }
    const segmentCount = entity.closed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      if (start.x === end.x && start.y === end.y) continue;
      pieces.push(capsulePolygon(start, end, radius));
    }
    points.forEach((point) => {
      const key = `${pointKey(point)}:${radius}`;
      if (!seen.has(key)) pieces.push(circlePolygon(point, radius));
      seen.add(key);
    });
  });
  return pieces;
}

export function buildRadiusContours(entities = [], radii = []) {
  const values = [...new Set(radii.map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => b - a);
  if (!values.length || !entities.length || !globalThis.polygonClipping?.union) return [];
  return values.map((radius) => {
    const pieces = bufferPieces(entities, radius);
    if (!pieces.length) return { radius, polygons: [] };
    let polygons = [];
    try { polygons = globalThis.polygonClipping.union(...pieces); } catch { polygons = []; }
    return { radius, polygons };
  }).filter((item) => item.polygons.length);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]; const b = ring[previous];
    const crosses = ((a[1] > point.y) !== (b[1] > point.y)) && (point.x < (b[0] - a[0]) * (point.y - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]);
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a, b, point) { return Math.min(a.x, b.x) - 1e-9 <= point.x && point.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= point.y && point.y <= Math.max(a.y, b.y) + 1e-9; }
function segmentsCross(a, b, c, d) {
  const ab1 = orientation(a, b, c); const ab2 = orientation(a, b, d); const cd1 = orientation(c, d, a); const cd2 = orientation(c, d, b);
  if (Math.abs(ab1) < 1e-9 && onSegment(a, b, c)) return true;
  if (Math.abs(ab2) < 1e-9 && onSegment(a, b, d)) return true;
  if (Math.abs(cd1) < 1e-9 && onSegment(c, d, a)) return true;
  if (Math.abs(cd2) < 1e-9 && onSegment(c, d, b)) return true;
  return (ab1 > 0) !== (ab2 > 0) && (cd1 > 0) !== (cd2 > 0);
}

function entityHitsPolygon(entity, polygon) {
  const rings = polygon || [];
  const outer = rings[0] || [];
  const points = entity.points || [];
  if (!outer.length || !points.length) return false;
  if (points.some((point) => pointInRing(point, outer))) return true;
  const contourPoints = outer.map(([x, y]) => ({ x, y }));
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]; const end = points[index];
    for (let edge = 1; edge < contourPoints.length; edge += 1) if (segmentsCross(start, end, contourPoints[edge - 1], contourPoints[edge])) return true;
  }
  if (entity.closed && contourPoints.some((point) => pointInRing(point, points))) return true;
  return false;
}

export function areaIntersectsContours(entities = [], contours = []) {
  return contours.some((contour) => contour.polygons.some((polygon) => entities.some((entity) => entityHitsPolygon(entity, polygon))));
}

export function formatNumber(value, fractionDigits = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 }).format(value);
}
