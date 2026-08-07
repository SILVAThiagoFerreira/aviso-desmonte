import { areaIntersectsContours, boundsOf, flattenStringEntities, formatNumber, getStringEndpoints, mergeBounds, paddedBounds } from './geometry.js';

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
  return { scale, x: (point) => offsetX + (point.x - bounds.minX) * scale, y: (point) => offsetY + (bounds.maxY - point.y) * scale };
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
    contour.polygons.forEach((polygon) => polygon.forEach((ring) => {
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
  const target = Math.max(bounds.maxX - bounds.minX, 1) / 4; const magnitude = 10 ** Math.floor(Math.log10(target)); const candidate = [1, 2, 5, 10].find((step) => step * magnitude >= target) * magnitude; const width = Math.min(candidate * transform.scale, 330);
  const x = box.x + box.width - width - 36; const y = box.y + box.height - 42;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 12, y - 26, width + 24, 48); ctx.fillStyle = '#111111'; ctx.fillRect(x, y, width / 2, 14); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + width / 2, y, width / 2, 14); ctx.strokeStyle = '#111111'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, 14); ctx.fillStyle = '#111111'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.fillText(`${formatNumber(candidate, 0)} m`, x + width / 2, y - 6);
}

function drawLegend(ctx, model, box, colors) {
  const x = box.x + 28; const y = box.y + box.height - 380; const width = 450; const height = 380;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = colors.ink; ctx.font = '700 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('LEGENDA', x + 16, y + 30);
  let rowY = y + 62;
  const line = (color, label, dashed = false) => { ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.setLineDash(dashed ? [12, 8] : []); ctx.beginPath(); ctx.moveTo(x + 16, rowY); ctx.lineTo(x + 62, rowY); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = colors.ink; ctx.font = '14px Arial'; ctx.fillText(label, x + 78, rowY + 5); rowY += 27; };
  model.radiusContours.forEach((contour) => line(Number(contour.radius) === Number(model.radii.people) ? colors.cyan : colors.greenLight, `Raio contínuo ${formatNumber(contour.radius, 0)} m`, false));
  line(colors.orange, 'String(s) de desmonte DXF');
  ctx.fillStyle = colors.ink; ctx.font = '700 13px Arial'; ctx.fillText('REGIÕES DE DESMONTE:', x + 16, rowY + 6); rowY += 27;
  (model.strings || []).slice(0, 8).forEach((item, index) => { ctx.fillStyle = colors.orange; ctx.font = '12px Arial'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${String(item.label || item.name).slice(0, 42)}`, x + 16, rowY); rowY += 18; });
}

function drawAreaGroup(ctx, areas, title, color, panel, colors, startY) {
  const x = panel.x + 10; const width = panel.width - 20; let y = startY; ctx.fillStyle = color; ctx.fillRect(x, y, width, 30); ctx.fillStyle = '#ffffff'; ctx.font = '700 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(title, x + width / 2, y + 21); y += 34;
  const height = Math.max(70, panel.y + panel.height - y - 10); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height); ctx.textAlign = 'left';
  if (!areas.length) { ctx.font = '12px Arial'; ctx.fillStyle = colors.muted; ctx.fillText('Nenhuma área', x + 10, y + 25); return y + 48; }
  areas.forEach((area, index) => { const label = String(area.label || area.name).slice(0, 26); ctx.fillStyle = colors.ink; ctx.font = '700 12px Arial'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${label}`, x + 9, y + 22 + index * 18); });
  return y + areas.length * 18 + 22;
}

function drawPanel(ctx, model, panel, colors) {
  ctx.fillStyle = colors.paper; ctx.fillRect(panel.x, panel.y, panel.width, panel.height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  if (model.logoImage) { const logoWidth = panel.width - 26; const logoHeight = logoWidth * model.logoImage.height / model.logoImage.width; ctx.drawImage(model.logoImage, panel.x + 13, panel.y + 8, logoWidth, Math.min(logoHeight, 70)); }
  const titleY = panel.y + 86; ctx.fillStyle = colors.green; ctx.fillRect(panel.x + 10, titleY, panel.width - 20, 54); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 18px Arial'; ctx.fillText('ÁREA DE INFLUÊNCIA', panel.x + panel.width / 2, titleY + 22); ctx.font = '700 15px Arial'; ctx.fillText(`DESMONTE - ${model.meta.dateLabel}`, panel.x + panel.width / 2, titleY + 44);
  ctx.fillStyle = colors.ink; ctx.textAlign = 'left'; ctx.font = '700 14px Arial'; ctx.fillText(model.meta.company || 'EMPRESA / OPERAÇÃO', panel.x + 12, titleY - 10);
  let y = titleY + 68; y = drawAreaGroup(ctx, model.areas.filter((area) => area.status === 'evacuar'), 'EVACUAR', colors.red, panel, colors, y); y += 16; drawAreaGroup(ctx, model.areas.filter((area) => area.status === 'liberado'), 'LIBERADO', colors.blue, panel, colors, y);
}

export function drawReport(canvas, model, config) {
  const width = config.report.canvasWidth; const height = config.report.canvasHeight; canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); const colors = config.report.colors; const map = config.report.map; const panel = config.report.panel; const stringEntities = flattenStringEntities(model.strings || []);
  const geometryBounds = mergeBounds([boundsOf(stringEntities), ...model.areas.map((area) => boundsOf(area.entities || []))]);
  const combinedBounds = mergeBounds([model.baseImage?.bounds, geometryBounds]);
  const bounds = model.boundsMode === 'manual' ? model.manualBounds : model.baseImage?.bounds ? combinedBounds : paddedBounds(geometryBounds);
  const transform = makeTransform(bounds, map);
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip(); ctx.fillStyle = '#dde6e4'; ctx.fillRect(map.x, map.y, map.width, map.height); if (model.baseImage?.bounds) drawGeoImage(ctx, model.baseImage, transform); else drawCoverImage(ctx, model.baseImage?.image || model.baseImage, map); ctx.restore();
  drawGrid(ctx, map, colors);
  if (transform) {
    model.areas.forEach((area) => { area.status = areaIntersectsContours(area.entities || [], model.radiusContours) ? 'evacuar' : 'liberado'; (area.entities || []).forEach((entity) => drawHatchedEntity(ctx, entity, transform, area.status === 'evacuar' ? colors.red : colors.blue, area.status === 'evacuar' ? colors.redSoft : colors.blueSoft)); });
    stringEntities.forEach((entity) => drawEntity(ctx, entity, transform, colors.orange));
    drawContours(ctx, model.radiusContours, transform, colors, model.radii);
    getStringEndpoints(stringEntities).forEach((point) => { ctx.fillStyle = colors.orange; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(transform.x(point), transform.y(point), 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  }
  drawNorth(ctx, map); drawScale(ctx, map, transform, bounds); drawLegend(ctx, model, map, colors); drawPanel(ctx, { ...model, meta: { ...model.meta, dateLabel: model.meta.date ? new Date(`${model.meta.date}T12:00:00`).toLocaleDateString('pt-BR') : 'DATA NÃO INFORMADA' } }, panel, colors);
  ctx.fillStyle = colors.ink; ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.fillText(model.meta.location || 'Local não informado', map.x + 8, height - 20); ctx.textAlign = 'right'; ctx.fillText(model.meta.observation || 'Valide os dados operacionais antes da emissão', width - 24, height - 20);
  return { bounds, endpointCount: getStringEndpoints(stringEntities).length, areaStatuses: model.areas.map((area) => ({ id: area.id, status: area.status })) };
}
