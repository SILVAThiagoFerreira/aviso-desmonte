import { areaIntersectsContours, boundsOf, boundsOfContours, differenceEntityWithContours, fitBoundsToAspect, flattenStringEntities, formatNumber, getStringEndpoints, intersectEntityWithContours, mergeBounds, paddedBounds, pointIntersectsContours } from './geometry.js';

function drawCoverImage(ctx, image, box) {
  if (!image) return;
  const imageRatio = image.width / image.height;
  const boxRatio = box.width / box.height;
  let sourceX = 0; let sourceY = 0; let sourceWidth = image.width; let sourceHeight = image.height;
  if (imageRatio > boxRatio) { sourceWidth = image.height * boxRatio; sourceX = (image.width - sourceWidth) / 2; }
  else { sourceHeight = image.width / boxRatio; sourceY = (image.height - sourceHeight) / 2; }
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, box.x, box.y, box.width, box.height);
}

function makeTransform(bounds, box) {
  if (!bounds) return null;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(box.width / width, box.height / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const offsetX = box.x + (box.width - drawnWidth) / 2;
  const offsetY = box.y + (box.height - drawnHeight) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    x: (point) => offsetX + (point.x - bounds.minX) * scale,
    y: (point) => offsetY + (bounds.maxY - point.y) * scale,
    world: (screenPoint) => ({
      x: bounds.minX + (screenPoint.x - offsetX) / scale,
      y: bounds.maxY - (screenPoint.y - offsetY) / scale,
    }),
  };
}

function drawGeoImage(ctx, baseImage, transform) {
  if (!baseImage?.image || !baseImage.bounds || !transform) return;
  const topLeft = { x: baseImage.bounds.minX, y: baseImage.bounds.maxY };
  const bottomRight = { x: baseImage.bounds.maxX, y: baseImage.bounds.minY };
  const x = transform.x(topLeft); const y = transform.y(topLeft);
  const width = transform.x(bottomRight) - x; const height = transform.y(bottomRight) - y;
  ctx.drawImage(baseImage.image, x, y, width, height);
}

function drawGrid(ctx, box, colors) {
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.setLineDash([3, 8]);
  for (let index = 1; index < 8; index += 1) {
    const x = box.x + box.width * index / 8; const y = box.y + box.height * index / 8;
    ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.width, y); ctx.stroke();
  }
  ctx.restore();
}

function entityPath(ctx, entity, transform) {
  if (!entity.points?.length) return false;
  ctx.beginPath();
  entity.points.forEach((point, index) => { const x = transform.x(point); const y = transform.y(point); if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  if (entity.closed) ctx.closePath();
  return true;
}

function drawHatchedEntity(ctx, entity, transform, hatchColor, fill, outlineColor = hatchColor) {
  if (!entityPath(ctx, entity, transform)) return;
  if (!entity.closed) { ctx.strokeStyle = outlineColor; ctx.lineWidth = 3; ctx.stroke(); return; }
  ctx.save(); ctx.fillStyle = fill; ctx.fill(); ctx.clip();
  const xs = entity.points.map((point) => transform.x(point)); const ys = entity.points.map((point) => transform.y(point));
  const minX = Math.min(...xs) - 80; const maxX = Math.max(...xs) + 80; const minY = Math.min(...ys) - 80; const maxY = Math.max(...ys) + 80;
  ctx.strokeStyle = hatchColor; ctx.lineWidth = 2;
  for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += 18) { ctx.beginPath(); ctx.moveTo(x, maxY); ctx.lineTo(x + (maxY - minY), minY); ctx.stroke(); }
  ctx.restore(); entityPath(ctx, entity, transform); ctx.strokeStyle = outlineColor; ctx.lineWidth = 3; ctx.stroke();
}

function drawHatchedPolygon(ctx, polygon, transform, hatchColor, fill, outlineColor = hatchColor) {
  if (!polygon?.length) return;
  ctx.save(); ctx.beginPath();
  polygon.forEach((ring) => {
    if (!ring?.length) return;
    ring.forEach(([x, y], index) => { const point = transform.x({ x, y }); const screenY = transform.y({ x, y }); if (index) ctx.lineTo(point, screenY); else ctx.moveTo(point, screenY); });
    ctx.closePath();
  });
  ctx.fillStyle = fill; ctx.fill('evenodd'); ctx.clip('evenodd');
  const points = polygon.flatMap((ring) => ring.map(([x, y]) => ({ x, y })));
  const xs = points.map((point) => transform.x(point)); const ys = points.map((point) => transform.y(point));
  const minX = Math.min(...xs) - 80; const maxX = Math.max(...xs) + 80; const minY = Math.min(...ys) - 80; const maxY = Math.max(...ys) + 80;
  ctx.strokeStyle = hatchColor; ctx.lineWidth = 2;
  for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += 18) { ctx.beginPath(); ctx.moveTo(x, maxY); ctx.lineTo(x + (maxY - minY), minY); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.beginPath();
  polygon.forEach((ring) => { ring.forEach(([x, y], index) => { const point = transform.x({ x, y }); const screenY = transform.y({ x, y }); if (index) ctx.lineTo(point, screenY); else ctx.moveTo(point, screenY); }); ctx.closePath(); });
  if (outlineColor) { ctx.strokeStyle = outlineColor; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.restore();
}

function drawEntity(ctx, entity, transform, color) {
  if (entity.type === 'circle') { const center = entity.points[0]; ctx.beginPath(); ctx.arc(transform.x(center), transform.y(center), entity.radius * transform.scale, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); return; }
  if (!entityPath(ctx, entity, transform)) return;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

function drawContours(ctx, contours, transform, colors, radii) {
    contours.forEach((contour) => {
    const isPeople = contour.kind ? contour.kind === 'people' : Number(contour.radius) === Number(radii.people);
    ctx.save(); ctx.strokeStyle = isPeople ? colors.cyan : colors.greenLight; ctx.lineWidth = 4; ctx.setLineDash([]);
    (contour.outline || contour.polygons).forEach((polygon) => { const ring = polygon[0];
      if (!ring.length) return;
      ctx.beginPath(); ring.forEach(([x, y], index) => { const point = transform.x({ x, y }); const screenY = transform.y({ x, y }); if (index) ctx.lineTo(point, screenY); else ctx.moveTo(point, screenY); }); ctx.closePath(); ctx.stroke();
    });
    ctx.restore();
  });
}

function drawNorth(ctx, box) {
  const x = box.x + 78; const y = box.y + 75;
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 42); ctx.lineTo(0, -35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(-18, -8); ctx.lineTo(0, -18); ctx.lineTo(18, -8); ctx.closePath(); ctx.fill();
  ctx.font = '700 18px Arial'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -58); ctx.restore();
}

function drawScale(ctx, box, transform, bounds) {
  if (!transform || !bounds) return;
  const target = Math.max(bounds.maxX - bounds.minX, 1) / 4; const magnitude = 10 ** Math.floor(Math.log10(target)); const candidate = [1, 2, 5, 10].find((step) => step * magnitude >= target) * magnitude; const width = Math.min(candidate * transform.scale, 330); const displayedDistance = width / transform.scale;
  const x = box.x + box.width - width - 36; const y = box.y + box.height - 42;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 12, y - 26, width + 24, 48); ctx.fillStyle = '#111111'; ctx.fillRect(x, y, width / 2, 14); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + width / 2, y, width / 2, 14); ctx.strokeStyle = '#111111'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, 14); ctx.fillStyle = '#111111'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.fillText(`${formatNumber(displayedDistance, 0)} m`, x + width / 2, y - 6);
}

function drawLegendIcon(ctx, image, x, y, size, fallback) {
  if (image) {
    const ratio = Math.min(size / image.width, size / image.height);
    const width = image.width * ratio; const height = image.height * ratio;
    ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
    return;
  }
  fallback(ctx, x + size / 2, y + size / 2, size);
}

function drawHatchSwatch(ctx, x, y, width, height, color, fill) {
  ctx.save(); ctx.fillStyle = fill; ctx.fillRect(x, y, width, height); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (let offset = -height; offset < width + height; offset += 9) { ctx.beginPath(); ctx.moveTo(x + offset, y + height); ctx.lineTo(x + offset + height, y); ctx.stroke(); }
  ctx.restore(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, width, height);
}

function fitCanvasText(ctx, value, maxWidth) {
  const text = String(value || '');
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result.trimEnd()}…`;
}

function stringColor(item, colors) { return colors[item?.blastType] || colors.production || colors.orange; }
const STRING_PRIORITY = { precut: 1, production: 2, regularization: 3 };
function sortedStrings(strings = []) { return [...strings].sort((left, right) => (STRING_PRIORITY[left.blastType] || 2) - (STRING_PRIORITY[right.blastType] || 2) || String(left.label || left.name).localeCompare(String(right.label || right.name), 'pt-BR')); }

function drawStringThumbnail(ctx, item, x, y, width, height, color) {
  const entities = item?.entities || [];
  const points = entities.flatMap((entity) => entity.points || []);
  if (!points.length) return;
  const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
  const sourceWidth = Math.max(maxX - minX, 1); const sourceHeight = Math.max(maxY - minY, 1);
  const scale = Math.min((width - 8) / sourceWidth, (height - 8) / sourceHeight);
  const offsetX = x + (width - sourceWidth * scale) / 2; const offsetY = y + (height - sourceHeight * scale) / 2;
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  entities.forEach((entity) => {
    const entityPoints = entity.points || []; if (!entityPoints.length) return;
    if (entity.type === 'circle') { const center = entityPoints[0]; const radius = Math.max(Number(entity.radius || 0) * scale, 2); ctx.beginPath(); ctx.arc(offsetX + (center.x - minX) * scale, offsetY + (maxY - center.y) * scale, radius, 0, Math.PI * 2); ctx.stroke(); return; }
    ctx.beginPath(); entityPoints.forEach((point, index) => { const px = offsetX + (point.x - minX) * scale; const py = offsetY + (maxY - point.y) * scale; if (index) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); if (entity.closed) ctx.closePath(); ctx.stroke();
  });
  ctx.restore();
}

function wrapCanvasText(ctx, value, maxWidth, maxLines = 2) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth && lines.length < maxLines - 1) { lines.push(current); current = word; } else current = candidate;
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = fitCanvasText(ctx, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxWidth); return kept; }
  return lines.map((line) => fitCanvasText(ctx, line, maxWidth));
}

function pointInRect(point, rect) { return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height; }
function rectOverlap(a, b) { return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); }

function orientation(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function segmentsCross(a, b, c, d) {
  const ab1 = orientation(a, b, c); const ab2 = orientation(a, b, d); const cd1 = orientation(c, d, a); const cd2 = orientation(c, d, b);
  return ((ab1 > 0) !== (ab2 > 0)) && ((cd1 > 0) !== (cd2 > 0));
}
function pointInScreenPolygon(point, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index]; const b = points[previous];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}
function entityOverlapsRect(entity, rect, transform) {
  const points = (entity.points || []).map((point) => ({ x: transform.x(point), y: transform.y(point) }));
  if (!points.length) return false;
  if (entity.type === 'circle') {
    const center = points[0]; const radius = Math.max(Number(entity.radius) || 0, 0) * transform.scale;
    const nearestX = Math.max(rect.x, Math.min(center.x, rect.x + rect.width)); const nearestY = Math.max(rect.y, Math.min(center.y, rect.y + rect.height));
    return Math.hypot(center.x - nearestX, center.y - nearestY) <= radius;
  }
  if (points.some((point) => pointInRect(point, rect))) return true;
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }];
  if (entity.closed && corners.some((corner) => pointInScreenPolygon(corner, points))) return true;
  const edges = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
  const segmentCount = entity.closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) { const start = points[index]; const end = points[(index + 1) % points.length]; if (edges.some(([a, b]) => segmentsCross(start, end, a, b))) return true; }
  return false;
}

function chooseLegendPlacement(ctx, model, box, width, height, transform) {
  const margin = 24;
  const candidates = [
    { name: 'bottom-left', x: box.x + margin, y: box.y + box.height - height - margin, preference: -100 },
    { name: 'bottom-center', x: box.x + (box.width - width) / 2, y: box.y + box.height - height - margin, preference: -50 },
    { name: 'bottom-right', x: box.x + box.width - width - margin, y: box.y + box.height - height - margin, preference: -20 },
    { name: 'middle-left', x: box.x + margin, y: box.y + (box.height - height) / 2, preference: 0 },
    { name: 'middle-right', x: box.x + box.width - width - margin, y: box.y + (box.height - height) / 2, preference: 0 },
    { name: 'top-left', x: box.x + margin, y: box.y + margin, preference: 10 },
    { name: 'top-center', x: box.x + (box.width - width) / 2, y: box.y + margin, preference: 20 },
    { name: 'top-right', x: box.x + box.width - width - margin, y: box.y + margin, preference: 30 }
  ].map((item) => ({ ...item, width, height }));
  const protectedRects = [
    { x: box.x + 20, y: box.y + 18, width: 140, height: 120 },
    { x: box.x + box.width - 390, y: box.y + box.height - 86, width: 390, height: 86 }
  ];
  const entities = flattenStringEntities(model.strings || []).concat((model.areas || []).flatMap((area) => area.entities || []));
  const projectedPoints = entities.flatMap((entity) => (entity.points || []).map((point) => ({ x: transform.x(point), y: transform.y(point) })));
  const operationalPoints = (model.firingPoints || []).concat(model.blockingPoints || [], model.cardPoints || []).map((point) => ({ x: transform.x(point), y: transform.y(point) }));
  return candidates.map((candidate) => {
    let score = protectedRects.reduce((total, rect) => total + rectOverlap(candidate, rect) / 1000, 0);
    const areaEntities = (model.areas || []).flatMap((area) => area.entities || []);
    areaEntities.forEach((entity) => { if (entityOverlapsRect(entity, candidate, transform)) score += 100000; });
    projectedPoints.forEach((point) => { if (pointInRect(point, candidate)) score += 4; });
    operationalPoints.forEach((point) => { if (pointInRect(point, candidate)) score += 20; });
    score += candidate.preference;
    return { ...candidate, score };
  }).sort((a, b) => a.score - b.score)[0];
}

function drawLegend(ctx, model, box, colors, transform) {
  const strings = sortedStrings(model.strings || []);
  const statusAreas = model.statusAreas || model.areas || [];
  const radiusRows = (model.radiusContours || []).map((contour) => { const isPeople = contour.kind ? contour.kind === 'people' : Number(contour.radius) === Number(model.radii?.people); return { color: isPeople ? colors.cyan : colors.greenLight, dashed: false, label: `Cx(r)=${formatNumber(contour.radius, 0)} m · RAIO DE SEGURANÇA · ${isPeople ? 'PESSOAS' : 'MÁQUINAS E EQUIPAMENTOS'}` }; });
  const rows = [...radiusRows];
  if (strings.length) rows.push({ color: colors.ink, label: 'POLIGONAIS / STRINGS DE DESMONTE' });
  if (statusAreas.some((area) => area.status === 'evacuar')) rows.push({ swatch: 'evacuar', label: 'EVACUAR' });
  if (statusAreas.some((area) => area.status === 'liberado')) rows.push({ swatch: 'liberado', label: 'LIBERADO' });
  if (model.firingPoints?.length) rows.push({ icon: 'firing', label: 'PONTOS DE DISPARO' });
  if (model.blockingPoints?.length) rows.push({ icon: 'blocking', label: 'PONTOS DE BLOQUEIO' });
  if (model.cardPoints?.length) rows.push({ icon: 'card', label: 'ENTREGA DE CARTÕES DE BLOQUEIO' });
  const shown = strings.slice(0, 24); const nameRows = strings.length ? Math.ceil(shown.length / 2) : 0; const overflow = Math.max(strings.length - shown.length, 0);
  const width = strings.length ? 470 : 430; const height = 54 + rows.length * 30 + (strings.length ? 34 + nameRows * 18 + (overflow ? 18 : 0) : 0);
  const placement = chooseLegendPlacement(ctx, model, box, width, height, transform); const { x, y } = placement;
  ctx.save(); ctx.globalAlpha = .96; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height); ctx.strokeStyle = '#aeb9b7'; ctx.lineWidth = 1; ctx.strokeRect(x + 7, y + 7, width - 14, height - 14);
  ctx.fillStyle = colors.ink; ctx.font = '700 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('LEGENDA:', x + 18, y + 31);
  let rowY = y + 57;
  rows.forEach((item) => {
    const iconY = rowY - 7;
    if (item.swatch === 'evacuar') drawHatchSwatch(ctx, x + 18, iconY, 44, 16, colors.redHatch, colors.redSoft);
    else if (item.swatch === 'liberado') drawHatchSwatch(ctx, x + 18, iconY, 44, 16, colors.blueHatch, colors.blueSoft);
    else if (item.icon === 'firing') drawLegendIcon(ctx, model.firingIcon, x + 18, rowY - 13, 26, (canvas, cx, cy, size) => { canvas.fillStyle = colors.orange; canvas.strokeStyle = colors.ink; canvas.lineWidth = 2; canvas.beginPath(); canvas.arc(cx, cy, size * .27, 0, Math.PI * 2); canvas.fill(); canvas.stroke(); });
    else if (item.icon === 'blocking') drawLegendIcon(ctx, model.blockingIcon, x + 18, rowY - 13, 26, (canvas, cx, cy, size) => { canvas.strokeStyle = colors.red; canvas.lineWidth = 2; canvas.beginPath(); canvas.moveTo(cx - size * .25, cy + size * .28); canvas.lineTo(cx - size * .12, cy - size * .25); canvas.lineTo(cx + size * .12, cy - size * .25); canvas.lineTo(cx + size * .25, cy + size * .28); canvas.stroke(); });
    else if (item.icon === 'card') drawLegendIcon(ctx, model.cardIcon, x + 18, rowY - 13, 26, (canvas, cx, cy, size) => { canvas.strokeStyle = colors.red; canvas.lineWidth = 2; canvas.strokeRect(cx - size * .3, cy - size * .2, size * .6, size * .4); canvas.fillStyle = colors.red; canvas.fillRect(cx - size * .22, cy - size * .05, size * .44, size * .08); });
    else { ctx.strokeStyle = item.color; ctx.lineWidth = 3; ctx.setLineDash(item.dashed ? [10, 7] : []); ctx.beginPath(); ctx.moveTo(x + 18, rowY); ctx.lineTo(x + 62, rowY); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = colors.ink; ctx.font = '12px Arial'; ctx.fillText(fitCanvasText(ctx, item.label, width - 98), x + 78, rowY + 5); rowY += 30;
  });
  if (strings.length) {
    ctx.fillStyle = colors.ink; ctx.font = '700 12px Arial'; ctx.fillText('REGIÕES DE DESMONTE DE ROCHAS:', x + 18, rowY + 7); rowY += 26;
    const rowsPerColumn = Math.max(1, Math.ceil(shown.length / 2));
    shown.forEach((item, index) => { const column = Math.floor(index / rowsPerColumn); const row = index % rowsPerColumn; const offset = column * (width / 2); const color = stringColor(item, colors); drawStringThumbnail(ctx, item, x + 14 + offset, rowY + row * 18 - 8, 38, 16, color); ctx.fillStyle = colors.ink; ctx.font = '10px Arial'; const type = item.blastType === 'precut' ? 'Pré-Corte' : item.blastType === 'regularization' ? 'Regularização/Bloco' : 'Produção'; ctx.fillText(fitCanvasText(ctx, `${String(index + 1).padStart(2, '0')} ${type}: ${item.label || item.name}`, width / 2 - 64), x + 50 + offset, rowY + row * 18 + 4); });
    if (overflow) { ctx.fillStyle = colors.muted; ctx.font = '10px Arial'; ctx.fillText(`+ ${overflow} poligonal(is) não exibida(s) na legenda`, x + 18, y + height - 14); }
  }
  ctx.restore(); return placement;
}

function drawPointMarker(ctx, point, transform, image, colors, kind, iconSizes = {}) {
  const x = transform.x(point); const y = transform.y(point); const size = Number(iconSizes[kind]) || 48;
  ctx.save(); ctx.globalAlpha = kind === 'firing' ? .82 : 1;
  drawLegendIcon(ctx, image, x - size / 2, y - size / 2, size, (canvas, cx, cy, markerSize) => {
    if (kind === 'blocking') { canvas.strokeStyle = colors.red; canvas.lineWidth = 3; canvas.beginPath(); canvas.moveTo(cx - markerSize * .25, cy + markerSize * .3); canvas.lineTo(cx - markerSize * .12, cy - markerSize * .25); canvas.lineTo(cx + markerSize * .12, cy - markerSize * .25); canvas.lineTo(cx + markerSize * .25, cy + markerSize * .3); canvas.stroke(); return; }
    if (kind === 'card') { canvas.fillStyle = '#ffffff'; canvas.strokeStyle = colors.red; canvas.lineWidth = 3; canvas.fillRect(cx - markerSize * .3, cy - markerSize * .2, markerSize * .6, markerSize * .4); canvas.strokeRect(cx - markerSize * .3, cy - markerSize * .2, markerSize * .6, markerSize * .4); return; }
    canvas.fillStyle = colors.orange; canvas.strokeStyle = colors.ink; canvas.lineWidth = 2; canvas.beginPath(); canvas.arc(cx, cy, markerSize * .27, 0, Math.PI * 2); canvas.fill(); canvas.stroke();
  });
  ctx.restore();
}

function projectStructurePoint(structure, bounds, pageMap = {}, transform, mapBox) {
  const map = { x: 61, y: 68, width: 1205, height: 1385, ...pageMap };
  if (structure.worldX !== null && structure.worldX !== undefined && structure.worldY !== null && structure.worldY !== undefined && Number.isFinite(Number(structure.worldX)) && Number.isFinite(Number(structure.worldY))) return { x: Number(structure.worldX), y: Number(structure.worldY) };
  if (map.worldTransform) { const world = map.worldTransform; return { x: world.originX + (Number(structure.pageX) - map.x) * world.scaleX, y: world.originY - (Number(structure.pageY) - map.y) * world.scaleY }; }
  const u = (Number(structure.pageX) - map.x) / map.width;
  const v = (Number(structure.pageY) - map.y) / map.height;
  const screenX = mapBox.x + u * mapBox.width;
  const screenY = mapBox.y + v * mapBox.height;
  return { x: bounds.minX + (screenX - transform.offsetX) / transform.scale, y: bounds.maxY - (screenY - transform.offsetY) / transform.scale };
}

function structureIntersectsReferencedArea(structure, model, contours) {
  const reference = structure.classificationArea;
  if (!reference) return false;
  const area = (model.areas || []).find((candidate) => candidate.catalogId === reference.catalogId);
  const entity = area?.entities?.[Number(reference.entityIndex)];
  return Boolean(entity && areaIntersectsContours([entity], contours));
}

function pointInsideClosedEntity(point, entity) {
  if (!entity?.closed || !entity.points || entity.points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = entity.points.length - 1; index < entity.points.length; previous = index, index += 1) {
    const current = entity.points[index]; const prior = entity.points[previous];
    const crosses = ((current.y > point.y) !== (prior.y > point.y))
      && point.x < (prior.x - current.x) * (point.y - current.y) / ((prior.y - current.y) || Number.EPSILON) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function structureInsideAffectedArea(point, model, contours) {
  return (model.areas || []).some((area) => (area.entities || []).some((entity) => pointInsideClosedEntity(point, entity) && areaIntersectsContours([entity], contours)));
}

function drawStructureMarker(ctx, structure, transform, colors, displayPoint = null, labelSize = 16, showLabel = true) {
  if (!showLabel) return;
  const point = structure.point; const actualX = transform.x(point); const actualY = transform.y(point); const x = displayPoint?.x ?? actualX; const y = displayPoint?.y ?? actualY; const color = structure.status === 'evacuar' ? colors.red : colors.blue;
  ctx.save();
  // Os números ficam limpos sobre o croqui; não desenhar linhas-guia que
  // confundem a leitura das strings e das poligonais na área operacional.
  const number = String(structure.id).replace('structure-', ''); ctx.globalAlpha = 1; ctx.font = `700 ${labelSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, labelSize * .34); ctx.strokeStyle = '#ffffff'; ctx.strokeText(number, x, y + 1); ctx.fillStyle = '#111111'; ctx.fillText(number, x, y + 1); ctx.restore();
}

function drawStructurePositionLabel(ctx, structure, point, transform, labelSize = 16) {
  if (!point) return;
  const x = transform.x(point); const y = transform.y(point); const number = String(structure.id).replace('structure-', '');
  ctx.save(); ctx.globalAlpha = 1; ctx.font = `700 ${labelSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, labelSize * .34); ctx.strokeStyle = '#ffffff'; ctx.strokeText(number, x, y + 1); ctx.fillStyle = '#111111'; ctx.fillText(number, x, y + 1); ctx.restore();
}
function drawStructurePolygonNumber(ctx, structure, entities, transform, status, labelSize = 16) {
  // A média dos vértices desloca o rótulo para sudoeste em polígonos
  // assimétricos. Use o centróide geométrico do maior contorno fechado.
  const candidate = entities.map((entity) => {
    const points = entity.points || [];
    if (points.length < 3) return null;
    let twiceArea = 0; let x = 0; let y = 0;
    points.forEach((point, index) => { const next = points[(index + 1) % points.length]; const cross = point.x * next.y - next.x * point.y; twiceArea += cross; x += (point.x + next.x) * cross; y += (point.y + next.y) * cross; });
    const area = Math.abs(twiceArea / 2);
    if (area < Number.EPSILON) return null;
    return { area, center: { x: x / (3 * twiceArea), y: y / (3 * twiceArea) } };
  }).filter(Boolean).sort((left, right) => right.area - left.area)[0];
  const points = entities.flatMap((entity) => entity.points || []);
  if (!points.length) return;
  const center = candidate?.center || { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
  const x = transform.x(center); const y = transform.y(center); const number = String(structure.id).replace('structure-', '');
  ctx.save(); ctx.globalAlpha = 1; ctx.font = `700 ${labelSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, labelSize * .34); ctx.strokeStyle = '#ffffff'; ctx.strokeText(number, x, y + 1); ctx.fillStyle = status === 'evacuar' ? '#111111' : '#111111'; ctx.fillText(number, x, y + 1); ctx.restore();
}

function placeStructureMarkers(structures, transform, contours = [], protectedPoints = []) {
  const offsets = [[0, 0]];
  for (let radius = 24; radius <= 96; radius += 24) {
    for (let step = 0; step < 8; step += 1) { const angle = Math.PI * 2 * step / 8; offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius]); }
  }
  const placed = [];
  const protectedScreenPoints = protectedPoints.map((point) => ({ x: transform.x(point), y: transform.y(point) }));
  return structures.map((structure) => {
    const actual = { x: transform.x(structure.point), y: transform.y(structure.point) };
    const candidates = structure.lockMarkerPosition ? [actual] : offsets.map(([dx, dy]) => ({ x: actual.x + dx, y: actual.y + dy }));
    const validCandidates = candidates.filter((candidate) => {
      if (!contours.length) return true;
      const inside = pointIntersectsContours(transform.world(candidate), contours);
      return structure.status === 'evacuar' ? inside : !inside;
    });
    const chosen = (validCandidates.length ? validCandidates : candidates).sort((a, b) => {
      const score = (candidate) => placed.reduce((total, point) => total + Math.max(0, 22 - Math.hypot(candidate.x - point.x, candidate.y - point.y)), 0)
        + protectedScreenPoints.reduce((total, point) => total + Math.max(0, 34 - Math.hypot(candidate.x - point.x, candidate.y - point.y)) * 2, 0);
      return score(a) - score(b);
    })[0];
    placed.push(chosen); return { structure, displayPoint: chosen };
  });
}

function drawAreaGroup(ctx, areas, title, color, panel, colors, startY, groupHeight = null) {
  const x = panel.x + 10; const width = panel.width - 20; let y = startY; ctx.fillStyle = color; ctx.fillRect(x, y, width, 30); ctx.fillStyle = '#ffffff'; ctx.font = '700 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(title, x + width / 2, y + 21); y += 34;
  const height = groupHeight ?? Math.max(70, areas.length * 18 + 24); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height); ctx.textAlign = 'left';
  if (!areas.length) { ctx.font = '12px Arial'; ctx.fillStyle = colors.muted; ctx.fillText('Nenhuma área', x + 10, y + 25); return y + height; }
  areas.forEach((area, index) => { const number = String(area.id || '').replace('structure-', '') || String(index + 1).padStart(2, '0'); const label = String(area.label || area.name); ctx.fillStyle = colors.ink; ctx.font = '700 11px Arial'; ctx.fillText(fitCanvasText(ctx, `${number}  ${label}`, width - 18), x + 9, y + 22 + index * 18); });
  return y + height;
}

function drawPanel(ctx, model, panel, colors) {
  ctx.fillStyle = colors.paper; ctx.fillRect(panel.x, panel.y, panel.width, panel.height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  const headerX = panel.x + 10; const headerWidth = panel.width - 20;
  if (model.logoImage) { const maxWidth = headerWidth - 12; const maxHeight = 58; const ratio = Math.min(maxWidth / model.logoImage.width, maxHeight / model.logoImage.height); const logoWidth = model.logoImage.width * ratio; const logoHeight = model.logoImage.height * ratio; ctx.drawImage(model.logoImage, panel.x + (panel.width - logoWidth) / 2, panel.y + 8, logoWidth, logoHeight); }
  ctx.fillStyle = colors.muted; ctx.textAlign = 'center'; ctx.font = '700 10px Arial'; wrapCanvasText(ctx, model.meta.company || 'EMPRESA / OPERAÇÃO', headerWidth - 8, 2).forEach((line, index) => ctx.fillText(line, panel.x + panel.width / 2, panel.y + 86 + index * 12));
  const titleY = panel.y + 112; const titleHeight = 62; const titleDate = model.meta.date ? `DESMONTE - ${model.meta.dateLabel}` : 'DATA NÃO INFORMADA'; ctx.fillStyle = colors.green; ctx.fillRect(headerX, titleY, headerWidth, titleHeight); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 15px Arial'; ctx.fillText(fitCanvasText(ctx, 'ÁREA DE INFLUÊNCIA', headerWidth - 12), panel.x + panel.width / 2, titleY + 23); ctx.font = '700 12px Arial'; ctx.fillText(fitCanvasText(ctx, titleDate, headerWidth - 12), panel.x + panel.width / 2, titleY + 46);
  const panelAreas = model.structures?.length ? model.structures : model.areas; const evacuarAreas = panelAreas.filter((area) => area.status === 'evacuar'); const liberadoAreas = panelAreas.filter((area) => area.status === 'liberado'); const startY = titleY + titleHeight + 12; const groupGap = 16; const available = panel.y + panel.height - 10 - startY - groupGap; const evacuarHeight = Math.max(70, evacuarAreas.length * 18 + 24); const liberadoHeight = Math.max(70, liberadoAreas.length * 18 + 24); const scale = Math.min(1, available / (evacuarHeight + liberadoHeight)); let y = startY; y = drawAreaGroup(ctx, evacuarAreas, 'EVACUAR', colors.red, panel, colors, y, Math.max(70, evacuarHeight * scale)); y += groupGap; drawAreaGroup(ctx, liberadoAreas, 'LIBERADO', colors.blue, panel, colors, y, Math.max(70, liberadoHeight * scale));
}

export function drawReport(canvas, model, config) {
  const logicalWidth = config.report.canvasWidth; const logicalHeight = config.report.canvasHeight; const outputScale = Math.max(1, Number(config.report.outputScale) || 1); const width = logicalWidth; const height = logicalHeight; canvas.width = Math.round(width * outputScale); canvas.height = Math.round(height * outputScale);
  const ctx = canvas.getContext('2d'); ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; const colors = config.report.colors; const map = config.report.map; const panel = config.report.panel; const stringEntities = flattenStringEntities(model.strings || []);
  const geometryBounds = mergeBounds([boundsOf(stringEntities), ...model.areas.map((area) => boundsOf(area.entities || []))]);
  const contourBounds = boundsOfContours(model.radiusContours || []);
  const operationalBounds = mergeBounds([geometryBounds, contourBounds]);
  const baseImages = model.baseImages?.length ? model.baseImages : model.baseImage ? [model.baseImage] : [];
  const imageBounds = mergeBounds(baseImages.map((image) => image?.bounds));
  const satelliteBounds = baseImages.find((image) => image.name === 'Esri World Imagery')?.bounds;
  const rawBounds = mergeBounds([operationalBounds, satelliteBounds || imageBounds]);
  const bounds = model.boundsMode === 'manual' ? model.manualBounds : fitBoundsToAspect(satelliteBounds ? rawBounds : paddedBounds(rawBounds), map.width / map.height);
  const extentSource = model.boundsMode === 'manual' ? 'manual' : operationalBounds ? (imageBounds ? 'georreferenciado' : 'geometria-e-raios') : 'imagem';
  const transform = makeTransform(bounds, map);
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip(); ctx.fillStyle = '#dde6e4'; ctx.fillRect(map.x, map.y, map.width, map.height);
  const georeferencedImages = baseImages.filter((image) => image?.bounds);
  const satelliteImage = georeferencedImages.find((image) => image.name === 'Esri World Imagery');
  if (satelliteImage?.image) drawCoverImage(ctx, satelliteImage.image, map);
  else if (!georeferencedImages.length) drawCoverImage(ctx, baseImages[0]?.image || baseImages[0], map);
  georeferencedImages.filter((image) => image !== satelliteImage).forEach((image) => drawGeoImage(ctx, image, transform));
  ctx.restore();
  drawGrid(ctx, map, colors);
  if (transform) {
    ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip();
    const areaEntities = model.areas.flatMap((area) => area.entities || []);
    // As geometrias das estruturas próximas continuam disponíveis para
    // classificação e rótulos, mas não são uma camada de área de influência.
    // Desenhá-las como hachura criava contornos internos antigos sobre a mina.
    const hatchEntities = model.areas.filter((area) => area.catalogId !== 'estruturas-proximas').flatMap((area) => area.entities || []);
    model.areas.forEach((area) => { area.status = areaIntersectsContours(area.entities || [], model.radiusContours) ? 'evacuar' : 'liberado'; });
    hatchEntities.forEach((entity) => {
      const basePieces = differenceEntityWithContours(entity, model.radiusContours);
      if (basePieces.length) basePieces.forEach((polygon) => drawHatchedPolygon(ctx, polygon, transform, colors.blueHatch, colors.blueSoft, null));
      else if (!entity.closed) drawHatchedEntity(ctx, entity, transform, colors.blueHatch, colors.blueSoft, colors.blue);
      if (entity.closed) drawEntity(ctx, entity, transform, colors.blue);
    });
    // Pinta somente a parcela geométrica atingida pelo raio. O restante da
    // área permanece azul, mas qualquer interseção, mesmo mínima, fica visível.
    hatchEntities.forEach((entity) => intersectEntityWithContours(entity, model.radiusContours).forEach((polygon) => drawHatchedPolygon(ctx, polygon, transform, colors.redHatch, colors.redSoft, colors.red)));
    const structurePoints = (model.structures || []).map((structure) => { const points = (structure.positions || []).map((position) => projectStructurePoint({ ...structure, worldX: position.x, worldY: position.y }, bounds, model.structurePageMap, transform, map)); const point = points[0] || projectStructurePoint(structure, bounds, model.structurePageMap, transform, map); return { ...structure, point, points: points.length ? points : [point] }; });
    structurePoints.forEach((structure) => { const polygonEntities = areaEntities.filter((entity) => entity.structureId === structure.id); const polygonInRadius = polygonEntities.length ? areaIntersectsContours(polygonEntities, model.radiusContours) : false; const pointInRadius = pointIntersectsContours(structure.point, model.radiusContours, model.structureBoundaryTolerance || 0); const automaticStatus = polygonEntities.length ? (polygonInRadius ? 'evacuar' : 'liberado') : (pointInRadius ? 'evacuar' : 'liberado'); structure.status = structure.statusOverride || automaticStatus; const target = model.structures.find((candidate) => candidate.id === structure.id); if (target) { target.status = structure.status; target.point = structure.point; target.points = structure.points; target.polygonEntities = polygonEntities; } structure.points.forEach((point) => drawStructurePositionLabel(ctx, structure, point, transform, model.areaNumberSize)); });
    drawContours(ctx, model.radiusContours, transform, colors, model.radii);
    // As poligonais de desmonte ficam na camada operacional superior do croqui.
    sortedStrings(model.strings || []).reverse().forEach((item) => (item.entities || []).forEach((entity) => drawEntity(ctx, entity, transform, stringColor(item, colors))));
    // O buffer já representa a extensão completa da poligonal. Não desenhar
    // círculos adicionais nas extremidades evita a aparência de raios sobrepostos.
    (model.firingPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.firingIcon, colors, 'firing', model.pointIconSizes));
    (model.blockingPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.blockingIcon, colors, 'blocking', model.pointIconSizes));
    (model.cardPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.cardIcon, colors, 'card', model.pointIconSizes));
    ctx.restore();
  }
  drawNorth(ctx, map); drawScale(ctx, map, transform, bounds); const legend = transform ? drawLegend(ctx, { ...model, areas: model.areas, statusAreas: model.structures?.length ? model.structures : model.areas }, map, colors, transform) : null; drawPanel(ctx, { ...model, meta: { ...model.meta, dateLabel: model.meta.date ? new Date(`${model.meta.date}T12:00:00`).toLocaleDateString('pt-BR') : 'DATA NÃO INFORMADA' } }, panel, colors);
  ctx.fillStyle = colors.ink; ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.fillText(model.meta.location || 'Local não informado', map.x + 8, height - 34); ctx.textAlign = 'right'; ctx.fillText(model.meta.observation || 'Valide os dados operacionais antes da emissão', width - 24, height - 34);
  return { bounds, map: { x: map.x * outputScale, y: map.y * outputScale, width: map.width * outputScale, height: map.height * outputScale }, transform, extentSource, legend, endpointCount: getStringEndpoints(stringEntities).length, areaStatuses: model.areas.map((area) => ({ id: area.id, status: area.status })) };
}
