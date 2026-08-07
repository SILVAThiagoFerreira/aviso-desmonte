import { areaIntersectsContours, boundsOf, boundsOfContours, flattenStringEntities, formatNumber, getStringEndpoints, mergeBounds, paddedBounds, pointIntersectsContours } from './geometry.js';

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
  return { scale, offsetX, offsetY, x: (point) => offsetX + (point.x - bounds.minX) * scale, y: (point) => offsetY + (bounds.maxY - point.y) * scale };
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

function drawHatchedEntity(ctx, entity, transform, color, fill) {
  if (!entityPath(ctx, entity, transform)) return;
  if (!entity.closed) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); return; }
  ctx.save(); ctx.fillStyle = fill; ctx.fill(); ctx.clip();
  const xs = entity.points.map((point) => transform.x(point)); const ys = entity.points.map((point) => transform.y(point));
  const minX = Math.min(...xs) - 80; const maxX = Math.max(...xs) + 80; const minY = Math.min(...ys) - 80; const maxY = Math.max(...ys) + 80;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += 18) { ctx.beginPath(); ctx.moveTo(x, maxY); ctx.lineTo(x + (maxY - minY), minY); ctx.stroke(); }
  ctx.restore(); entityPath(ctx, entity, transform); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
}

function drawEntity(ctx, entity, transform, color) {
  if (entity.type === 'circle') { const center = entity.points[0]; ctx.beginPath(); ctx.arc(transform.x(center), transform.y(center), entity.radius * transform.scale, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); return; }
  if (!entityPath(ctx, entity, transform)) return;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

function drawContours(ctx, contours, transform, colors, radii) {
  contours.forEach((contour) => {
    const isPeople = Number(contour.radius) === Number(radii.people);
    ctx.save(); ctx.strokeStyle = isPeople ? colors.cyan : colors.greenLight; ctx.lineWidth = isPeople ? 4 : 4; ctx.setLineDash(isPeople ? [] : [15, 9]);
    (contour.outline || contour.polygons).forEach((polygon) => polygon.forEach((ring) => {
      if (!ring.length) return;
      ctx.beginPath(); ring.forEach(([x, y], index) => { const point = transform.x({ x, y }); const screenY = transform.y({ x, y }); if (index) ctx.lineTo(point, screenY); else ctx.moveTo(point, screenY); }); ctx.closePath(); ctx.stroke();
    }));
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

function pointInRect(point, rect) { return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height; }
function rectOverlap(a, b) { return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); }

function chooseLegendPlacement(ctx, model, box, width, height, transform) {
  const margin = 24;
  const candidates = [
    { name: 'bottom-left', x: box.x + margin, y: box.y + box.height - height - margin },
    { name: 'top-left', x: box.x + margin, y: box.y + margin },
    { name: 'top-right', x: box.x + box.width - width - margin, y: box.y + margin },
    { name: 'bottom-right', x: box.x + box.width - width - margin, y: box.y + box.height - height - margin }
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
    projectedPoints.forEach((point) => { if (pointInRect(point, candidate)) score += 4; });
    operationalPoints.forEach((point) => { if (pointInRect(point, candidate)) score += 20; });
    score += Math.abs(candidate.x - (box.x + box.width / 2)) * 0.0001;
    return { ...candidate, score };
  }).sort((a, b) => a.score - b.score)[0];
}

function drawLegend(ctx, model, box, colors, transform) {
  const strings = model.strings || [];
  const radiusRows = (model.radiusContours || []).map((contour) => ({ color: Number(contour.radius) === Number(model.radii?.people) ? colors.cyan : colors.greenLight, dashed: Number(contour.radius) !== Number(model.radii?.people), label: `Cx(r)=${formatNumber(contour.radius, 0)} m · RAIO DE SEGURANÇA · ${Number(contour.radius) === Number(model.radii?.people) ? 'PESSOAS' : 'MÁQUINAS E EQUIPAMENTOS'}` }));
  const rows = [...radiusRows];
  if (strings.length) rows.push({ color: colors.orange, label: 'POLIGONAIS / STRINGS DE DESMONTE' });
  if (model.areas?.some((area) => area.status === 'evacuar')) rows.push({ swatch: 'evacuar', label: 'EVACUAR' });
  if (model.areas?.some((area) => area.status === 'liberado')) rows.push({ swatch: 'liberado', label: 'LIBERADO' });
  if (model.firingPoints?.length) rows.push({ icon: 'firing', label: 'PONTOS DE DISPARO' });
  if (model.blockingPoints?.length) rows.push({ icon: 'blocking', label: 'PONTOS DE BLOQUEIO' });
  if (model.cardPoints?.length) rows.push({ icon: 'card', label: 'ENTREGA DE CARTÕES DE BLOQUEIO' });
  const shown = strings.slice(0, 24); const nameRows = strings.length ? Math.ceil(shown.length / 2) : 0; const overflow = Math.max(strings.length - shown.length, 0);
  const width = strings.length ? 560 : 440; const height = 54 + rows.length * 24 + (strings.length ? 34 + nameRows * 18 + (overflow ? 18 : 0) : 0);
  const placement = chooseLegendPlacement(ctx, model, box, width, height, transform); const { x, y } = placement;
  ctx.save(); ctx.globalAlpha = .96; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height); ctx.strokeStyle = '#aeb9b7'; ctx.lineWidth = 1; ctx.strokeRect(x + 7, y + 7, width - 14, height - 14);
  ctx.fillStyle = colors.ink; ctx.font = '700 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('LEGENDA:', x + 18, y + 31);
  let rowY = y + 57;
  rows.forEach((item) => {
    const iconY = rowY - 9;
    if (item.swatch === 'evacuar') drawHatchSwatch(ctx, x + 18, iconY, 44, 16, colors.red, colors.redSoft);
    else if (item.swatch === 'liberado') drawHatchSwatch(ctx, x + 18, iconY, 44, 16, colors.blue, colors.blueSoft);
    else if (item.icon === 'firing') drawLegendIcon(ctx, model.firingIcon, x + 18, rowY - 15, 44, (canvas, cx, cy, size) => { canvas.fillStyle = colors.orange; canvas.strokeStyle = colors.ink; canvas.lineWidth = 2; canvas.beginPath(); canvas.arc(cx, cy, size * .27, 0, Math.PI * 2); canvas.fill(); canvas.stroke(); });
    else if (item.icon === 'blocking') drawLegendIcon(ctx, model.blockingIcon, x + 18, rowY - 16, 44, (canvas, cx, cy, size) => { canvas.strokeStyle = colors.red; canvas.lineWidth = 3; canvas.beginPath(); canvas.moveTo(cx - size * .25, cy + size * .28); canvas.lineTo(cx - size * .12, cy - size * .25); canvas.lineTo(cx + size * .12, cy - size * .25); canvas.lineTo(cx + size * .25, cy + size * .28); canvas.stroke(); });
    else if (item.icon === 'card') drawLegendIcon(ctx, model.cardIcon, x + 18, rowY - 16, 44, (canvas, cx, cy, size) => { canvas.strokeStyle = colors.red; canvas.lineWidth = 2; canvas.strokeRect(cx - size * .3, cy - size * .2, size * .6, size * .4); canvas.fillStyle = colors.red; canvas.fillRect(cx - size * .22, cy - size * .05, size * .44, size * .08); });
    else { ctx.strokeStyle = item.color; ctx.lineWidth = 3; ctx.setLineDash(item.dashed ? [10, 7] : []); ctx.beginPath(); ctx.moveTo(x + 18, rowY); ctx.lineTo(x + 62, rowY); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = colors.ink; ctx.font = '12px Arial'; ctx.fillText(fitCanvasText(ctx, item.label, width - 98), x + 78, rowY + 5); rowY += 24;
  });
  if (strings.length) {
    ctx.fillStyle = colors.ink; ctx.font = '700 12px Arial'; ctx.fillText('REGIÕES DE DESMONTE DE ROCHAS:', x + 18, rowY + 7); rowY += 26;
    const rowsPerColumn = Math.max(1, Math.ceil(shown.length / 2));
    shown.forEach((item, index) => { const column = Math.floor(index / rowsPerColumn); const row = index % rowsPerColumn; const offset = column * (width / 2); ctx.strokeStyle = colors.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 18 + offset, rowY + row * 18); ctx.lineTo(x + 44 + offset, rowY + row * 18); ctx.stroke(); ctx.fillStyle = colors.ink; ctx.font = '10px Arial'; ctx.fillText(fitCanvasText(ctx, `${String(index + 1).padStart(2, '0')} ${item.label || item.name}`, width / 2 - 64), x + 50 + offset, rowY + row * 18 + 4); });
    if (overflow) { ctx.fillStyle = colors.muted; ctx.font = '10px Arial'; ctx.fillText(`+ ${overflow} poligonal(is) não exibida(s) na legenda`, x + 18, y + height - 14); }
  }
  ctx.restore(); return placement;
}

function drawPointMarker(ctx, point, transform, image, colors, kind) {
  const x = transform.x(point); const y = transform.y(point); const size = kind === 'firing' ? 42 : 48;
  drawLegendIcon(ctx, image, x - size / 2, y - size / 2, size, (canvas, cx, cy, markerSize) => {
    if (kind === 'blocking') { canvas.strokeStyle = colors.red; canvas.lineWidth = 3; canvas.beginPath(); canvas.moveTo(cx - markerSize * .25, cy + markerSize * .3); canvas.lineTo(cx - markerSize * .12, cy - markerSize * .25); canvas.lineTo(cx + markerSize * .12, cy - markerSize * .25); canvas.lineTo(cx + markerSize * .25, cy + markerSize * .3); canvas.stroke(); return; }
    if (kind === 'card') { canvas.fillStyle = '#ffffff'; canvas.strokeStyle = colors.red; canvas.lineWidth = 3; canvas.fillRect(cx - markerSize * .3, cy - markerSize * .2, markerSize * .6, markerSize * .4); canvas.strokeRect(cx - markerSize * .3, cy - markerSize * .2, markerSize * .6, markerSize * .4); return; }
    canvas.fillStyle = colors.orange; canvas.strokeStyle = colors.ink; canvas.lineWidth = 2; canvas.beginPath(); canvas.arc(cx, cy, markerSize * .27, 0, Math.PI * 2); canvas.fill(); canvas.stroke();
  });
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.font = '700 10px Arial'; ctx.textAlign = 'left';
  if (point.label) { const text = String(point.label).slice(0, 22); const width = ctx.measureText(text).width + 8; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x + 21, y - 13, width, 17); ctx.strokeRect(x + 21, y - 13, width, 17); ctx.fillStyle = colors.ink; ctx.fillText(text, x + 25, y - 1); }
}

function projectStructurePoint(structure, bounds, pageMap = {}, transform, mapBox) {
  const map = { x: 61, y: 68, width: 1205, height: 1385, ...pageMap };
  if (map.worldTransform) { const world = map.worldTransform; return { x: world.originX + (Number(structure.pageX) - map.x) * world.scaleX, y: world.originY - (Number(structure.pageY) - map.y) * world.scaleY }; }
  const u = (Number(structure.pageX) - map.x) / map.width;
  const v = (Number(structure.pageY) - map.y) / map.height;
  const screenX = mapBox.x + u * mapBox.width;
  const screenY = mapBox.y + v * mapBox.height;
  return { x: bounds.minX + (screenX - transform.offsetX) / transform.scale, y: bounds.maxY - (screenY - transform.offsetY) / transform.scale };
}

function drawStructureMarker(ctx, structure, transform, colors) {
  const point = structure.point; const x = transform.x(point); const y = transform.y(point); const color = structure.status === 'evacuar' ? colors.red : colors.blue;
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.font = '700 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(structure.id).replace('structure-', ''), x, y + 1); ctx.restore();
}

function drawAreaGroup(ctx, areas, title, color, panel, colors, startY) {
  const x = panel.x + 10; const width = panel.width - 20; let y = startY; ctx.fillStyle = color; ctx.fillRect(x, y, width, 30); ctx.fillStyle = '#ffffff'; ctx.font = '700 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(title, x + width / 2, y + 21); y += 34;
  const height = Math.max(70, panel.y + panel.height - y - 10); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height); ctx.textAlign = 'left';
  if (!areas.length) { ctx.font = '12px Arial'; ctx.fillStyle = colors.muted; ctx.fillText('Nenhuma área', x + 10, y + 25); return y + 48; }
  areas.forEach((area, index) => { const number = String(area.id || '').replace('structure-', '') || String(index + 1).padStart(2, '0'); const label = String(area.label || area.name).slice(0, 32); ctx.fillStyle = colors.ink; ctx.font = '700 11px Arial'; ctx.fillText(`${number}  ${label}`, x + 9, y + 22 + index * 18); });
  return y + areas.length * 18 + 22;
}

function drawPanel(ctx, model, panel, colors) {
  ctx.fillStyle = colors.paper; ctx.fillRect(panel.x, panel.y, panel.width, panel.height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  if (model.logoImage) { const maxWidth = panel.width - 26; const maxHeight = 68; const ratio = Math.min(maxWidth / model.logoImage.width, maxHeight / model.logoImage.height); const logoWidth = model.logoImage.width * ratio; const logoHeight = model.logoImage.height * ratio; ctx.drawImage(model.logoImage, panel.x + (panel.width - logoWidth) / 2, panel.y + 8, logoWidth, logoHeight); }
  const titleY = panel.y + 98; ctx.fillStyle = colors.green; ctx.fillRect(panel.x + 10, titleY, panel.width - 20, 54); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 18px Arial'; ctx.fillText('ÁREA DE INFLUÊNCIA', panel.x + panel.width / 2, titleY + 22); ctx.font = '700 15px Arial'; ctx.fillText(`DESMONTE - ${model.meta.dateLabel}`, panel.x + panel.width / 2, titleY + 44);
  ctx.fillStyle = colors.ink; ctx.textAlign = 'left'; ctx.font = '700 14px Arial'; ctx.fillText(model.meta.company || 'EMPRESA / OPERAÇÃO', panel.x + 12, titleY - 10);
  const panelAreas = model.structures?.length ? model.structures : model.areas; let y = titleY + 68; y = drawAreaGroup(ctx, panelAreas.filter((area) => area.status === 'evacuar'), 'EVACUAR', colors.red, panel, colors, y); y += 16; drawAreaGroup(ctx, panelAreas.filter((area) => area.status === 'liberado'), 'LIBERADO', colors.blue, panel, colors, y);
}

export function drawReport(canvas, model, config) {
  const width = config.report.canvasWidth; const height = config.report.canvasHeight; canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); const colors = config.report.colors; const map = config.report.map; const panel = config.report.panel; const stringEntities = flattenStringEntities(model.strings || []);
  const geometryBounds = mergeBounds([boundsOf(stringEntities), ...model.areas.map((area) => boundsOf(area.entities || []))]);
  const contourBounds = boundsOfContours(model.radiusContours || []);
  const operationalBounds = mergeBounds([geometryBounds, contourBounds]);
  const baseImages = model.baseImages?.length ? model.baseImages : model.baseImage ? [model.baseImage] : [];
  const imageBounds = mergeBounds(baseImages.map((image) => image?.bounds));
  const bounds = model.boundsMode === 'manual' ? model.manualBounds : paddedBounds(operationalBounds || imageBounds);
  const extentSource = model.boundsMode === 'manual' ? 'manual' : operationalBounds ? (imageBounds ? 'georreferenciado' : 'geometria-e-raios') : 'imagem';
  const transform = makeTransform(bounds, map);
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip(); ctx.fillStyle = '#dde6e4'; ctx.fillRect(map.x, map.y, map.width, map.height);
  const georeferencedImages = baseImages.filter((image) => image?.bounds);
  if (georeferencedImages.length) georeferencedImages.forEach((image) => drawGeoImage(ctx, image, transform));
  else drawCoverImage(ctx, baseImages[0]?.image || baseImages[0], map);
  ctx.restore();
  drawGrid(ctx, map, colors);
  if (transform) {
    ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip();
    model.areas.forEach((area) => { area.status = areaIntersectsContours(area.entities || [], model.radiusContours) ? 'evacuar' : 'liberado'; (area.entities || []).forEach((entity) => drawHatchedEntity(ctx, entity, transform, area.status === 'evacuar' ? colors.red : colors.blue, area.status === 'evacuar' ? colors.redSoft : colors.blueSoft)); });
    const structurePoints = (model.structures || []).map((structure) => ({ ...structure, point: projectStructurePoint(structure, bounds, model.structurePageMap, transform, map) }));
    structurePoints.forEach((structure) => { structure.status = pointIntersectsContours(structure.point, model.radiusContours) ? 'evacuar' : 'liberado'; const target = model.structures.find((candidate) => candidate.id === structure.id); if (target) { target.status = structure.status; target.point = structure.point; } drawStructureMarker(ctx, structure, transform, colors); });
    stringEntities.forEach((entity) => drawEntity(ctx, entity, transform, colors.orange));
    drawContours(ctx, model.radiusContours, transform, colors, model.radii);
    getStringEndpoints(stringEntities).forEach((point) => { ctx.fillStyle = colors.orange; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(transform.x(point), transform.y(point), 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    (model.firingPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.firingIcon, colors, 'firing'));
    (model.blockingPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.blockingIcon, colors, 'blocking'));
    (model.cardPoints || []).forEach((point) => drawPointMarker(ctx, point, transform, model.cardIcon, colors, 'card'));
    ctx.restore();
  }
  drawNorth(ctx, map); drawScale(ctx, map, transform, bounds); const legend = transform ? drawLegend(ctx, { ...model, areas: model.structures?.length ? model.structures : model.areas }, map, colors, transform) : null; drawPanel(ctx, { ...model, meta: { ...model.meta, dateLabel: model.meta.date ? new Date(`${model.meta.date}T12:00:00`).toLocaleDateString('pt-BR') : 'DATA NÃO INFORMADA' } }, panel, colors);
  ctx.fillStyle = colors.ink; ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.fillText(model.meta.location || 'Local não informado', map.x + 8, height - 20); ctx.textAlign = 'right'; ctx.fillText(model.meta.observation || 'Valide os dados operacionais antes da emissão', width - 24, height - 20);
  return { bounds, map, transform, extentSource, legend, endpointCount: getStringEndpoints(stringEntities).length, areaStatuses: model.areas.map((area) => ({ id: area.id, status: area.status })) };
}
