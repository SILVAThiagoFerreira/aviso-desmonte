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

export function boundsOfContours(contours = []) {
  const points = contours.flatMap((contour) => (contour.polygons || []).flatMap((polygon) => polygon.flatMap((ring) => ring.map(([x, y]) => ({ x, y })))));
  return boundsOf(points.length ? [{ points }] : []);
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

export function fitBoundsToAspect(bounds, aspect = 1) {
  if (!bounds || !Number.isFinite(aspect) || aspect <= 0) return bounds;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const currentAspect = width / height;
  if (Math.abs(currentAspect - aspect) < 1e-9) return bounds;
  if (currentAspect < aspect) {
    const extra = (height * aspect - width) / 2;
    return { minX: bounds.minX - extra, minY: bounds.minY, maxX: bounds.maxX + extra, maxY: bounds.maxY };
  }
  const extra = (width / aspect - height) / 2;
  return { minX: bounds.minX, minY: bounds.minY - extra, maxX: bounds.maxX, maxY: bounds.maxY + extra };
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

function entityGeometryKey(entity) {
  const points = (entity.points || []).map(pointKey);
  if (entity.closed && points.length > 1 && points[0] === points[points.length - 1]) points.pop();
  if (entity.closed && points.length > 1) {
    const variants = [];
    for (const sequence of [points, [...points].reverse()]) {
      for (let offset = 0; offset < sequence.length; offset += 1) variants.push(sequence.slice(offset).concat(sequence.slice(0, offset)).join('|'));
    }
    return `${entity.type}|closed|${entity.radius || ''}|${variants.sort()[0]}`;
  }
  return `${entity.type}|${entity.closed ? 'closed' : 'open'}|${entity.radius || ''}|${points.join('|')}`;
}

export function dedupeEntities(entities = []) {
  const seen = new Set();
  return entities.filter((entity) => {
    const key = entityGeometryKey(entity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function roundedBoundsPolygon(entities, radius) {
  const bounds = boundsOf(entities);
  if (!bounds) return [];
  const minX = bounds.minX - radius; const minY = bounds.minY - radius; const maxX = bounds.maxX + radius; const maxY = bounds.maxY + radius; const cornerSteps = 8;
  const corners = [[maxX - radius, maxY - radius, 0], [minX + radius, maxY - radius, Math.PI / 2], [minX + radius, minY + radius, Math.PI], [maxX - radius, minY + radius, Math.PI * 1.5]];
  const ring = [];
  corners.forEach(([cx, cy, start]) => { for (let index = 0; index <= cornerSteps; index += 1) { const angle = start + Math.PI / 2 * index / cornerSteps; ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]); } });
  ring.push(ring[0]);
  return [[ring]];
}

function unionInBatches(pieces, batchSize = 24) {
  let pending = pieces;
  while (pending.length > 1) {
    const next = [];
    for (let index = 0; index < pending.length; index += batchSize) next.push(...globalThis.polygonClipping.union(...pending.slice(index, index + batchSize)));
    if (next.length >= pending.length) return next;
    pending = next;
  }
  return pending;
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
    try { polygons = pieces.length > 120 ? unionInBatches(pieces) : globalThis.polygonClipping.union(...pieces); } catch { polygons = pieces; }
    if (!polygons.length) return { radius, polygons: pieces, outline: roundedBoundsPolygon(entities, radius) };
    return { radius, polygons };
  }).filter((item) => item.polygons.length);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]; const b = ring[previous];
    const cross = (b[0] - a[0]) * (point.y - a[1]) - (b[1] - a[1]) * (point.x - a[0]);
    const within = point.x >= Math.min(a[0], b[0]) - 1e-9 && point.x <= Math.max(a[0], b[0]) + 1e-9 && point.y >= Math.min(a[1], b[1]) - 1e-9 && point.y <= Math.max(a[1], b[1]) + 1e-9;
    if (Math.abs(cross) <= 1e-9 && within) return true;
    const crosses = ((a[1] > point.y) !== (b[1] > point.y)) && (point.x < (b[0] - a[0]) * (point.y - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  const outer = polygon?.[0] || [];
  if (!pointInRing(point, outer)) return false;
  return (polygon || []).slice(1).every((hole) => !pointInRing(point, hole));
}

function pointToRingDistance(point, ring) {
  let minimum = Infinity;
  for (let index = 1; index < ring.length; index += 1) minimum = Math.min(minimum, segmentDistance(point, ring[index - 1], ring[index]));
  return minimum;
}

function segmentDistance(point, start, end) {
  const dx = end[0] - start[0]; const dy = end[1] - start[1]; const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start[0], point.y - start[1]);
  const ratio = Math.max(0, Math.min(1, ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / lengthSquared));
  return Math.hypot(point.x - (start[0] + ratio * dx), point.y - (start[1] + ratio * dy));
}

export function pointIntersectsContours(point, contours = [], boundaryTolerance = 0) {
  return contours.some((contour) => (contour.polygons || []).some((polygon) => pointInPolygon(point, polygon) && (!boundaryTolerance || pointToRingDistance(point, polygon[0] || []) >= boundaryTolerance)));
}

export function intersectEntityWithContours(entity, contours = []) {
  if (!entity?.closed || entity.type === 'circle' || (entity.points || []).length < 3 || !globalThis.polygonClipping?.intersection) return [];
  const ring = entity.points.map((point) => [point.x, point.y]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
  const subject = [[ring]];
  const intersections = [];
  contours.forEach((contour) => (contour.polygons || []).forEach((polygon) => {
    try {
      const pieces = globalThis.polygonClipping.intersection(subject, [polygon]);
      if (pieces?.length) intersections.push(...pieces);
    } catch {
      // Uma geometria opcional inválida não pode impedir a renderização da prancha.
    }
  }));
  return intersections;
}

export function differenceEntityWithContours(entity, contours = []) {
  if (!entity?.closed || entity.type === 'circle' || (entity.points || []).length < 3 || !globalThis.polygonClipping?.difference) return [];
  const ring = entity.points.map((point) => [point.x, point.y]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
  let remaining = [[ring]];
  contours.forEach((contour) => (contour.polygons || []).forEach((polygon) => {
    if (!remaining.length) return;
    try { remaining = globalThis.polygonClipping.difference(remaining, [polygon]) || []; } catch { /* mantém a geometria original em caso de falha opcional */ }
  }));
  return remaining;
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
