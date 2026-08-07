import { boundsOf, formatNumber, getStringEndpoints, mergeBounds, paddedBounds } from './geometry.js';

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

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

function drawGrid(ctx, box, transform, bounds, colors) {
  if (!transform || !bounds) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.setLineDash([3, 8]);
  const steps = 8;
  for (let index = 1; index < steps; index += 1) {
    const x = box.x + box.width * index / steps;
    const y = box.y + box.height * index / steps;
    ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.width, y); ctx.stroke();
  }
  ctx.restore();
}

function polygonPath(ctx, entity, transform) {
  if (!entity.points?.length) return false;
  ctx.beginPath();
  entity.points.forEach((point, index) => {
    const x = transform.x(point); const y = transform.y(point);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  if (entity.closed) ctx.closePath();
  return true;
}

function drawHatchedEntity(ctx, entity, transform, color, fill) {
  if (!polygonPath(ctx, entity, transform)) return;
  if (entity.closed) {
    ctx.save(); ctx.fillStyle = fill; ctx.fill(); ctx.clip();
    const xs = entity.points.map((point) => transform.x(point)); const ys = entity.points.map((point) => transform.y(point));
    const minX = Math.min(...xs) - 40; const maxX = Math.max(...xs) + 40; const minY = Math.min(...ys) - 40; const maxY = Math.max(...ys) + 40;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([]);
    for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += 18) { ctx.beginPath(); ctx.moveTo(x, maxY); ctx.lineTo(x + (maxY - minY), minY); ctx.stroke(); }
    ctx.restore();
    polygonPath(ctx, entity, transform); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  } else { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); }
}

function drawEntity(ctx, entity, transform, color) {
  if (entity.type === 'circle') {
    const center = entity.points[0]; ctx.beginPath(); ctx.arc(transform.x(center), transform.y(center), entity.radius * transform.scale, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); return;
  }
  if (!polygonPath(ctx, entity, transform)) return;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

function drawNorth(ctx, box) {
  const x = box.x + 78; const y = box.y + 75;
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 42); ctx.lineTo(0, -35); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(-18, -8); ctx.lineTo(0, -18); ctx.lineTo(18, -8); ctx.closePath(); ctx.fill();
  ctx.font = '700 18px Arial'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -58); ctx.restore();
}

function drawScale(ctx, box, transform, bounds) {
  if (!transform || !bounds) return;
  const worldWidth = bounds.maxX - bounds.minX;
  const target = worldWidth / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
  const steps = [1, 2, 5, 10];
  const value = steps.find((step) => step * magnitude >= target) * magnitude;
  const width = value * transform.scale;
  const x = box.x + box.width - Math.min(width, 330) - 36; const y = box.y + box.height - 42;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 12, y - 26, Math.min(width, 330) + 24, 48);
  ctx.fillStyle = '#111111'; ctx.fillRect(x, y, Math.min(width, 330) / 2, 14); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.min(width, 330) / 2, y, Math.min(width, 330) / 2, 14);
  ctx.strokeStyle = '#111111'; ctx.lineWidth = 2; ctx.strokeRect(x, y, Math.min(width, 330), 14);
  ctx.fillStyle = '#111111'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.fillText(`${formatNumber(value, 0)} m`, x + Math.min(width, 330) / 2, y - 6);
}

function drawLegend(ctx, model, box, colors) {
  const x = box.x + 28; const y = box.y + box.height - 372; const width = 390; const height = 372;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = colors.ink; ctx.font = '700 17px Arial'; ctx.textAlign = 'left'; ctx.fillText('LEGENDA', x + 16, y + 28);
  const rows = [];
  if (model.radii.people > 0) rows.push({ color: colors.greenLight, label: `Raio de segurança ${formatNumber(model.radii.people, 0)}m - pessoas`, dashed: true });
  if (model.radii.machine > 0) rows.push({ color: colors.cyan, label: `Raio de segurança ${formatNumber(model.radii.machine, 0)}m - máquinas`, dashed: true });
  rows.push({ color: colors.orange, label: 'String DXF / extremidades', dashed: false });
  rows.push({ color: colors.red, label: 'Evacuar', dashed: false }); rows.push({ color: colors.blue, label: 'Liberado', dashed: false });
  rows.forEach((row, index) => { const rowY = y + 60 + index * 30; ctx.strokeStyle = row.color; ctx.lineWidth = 4; ctx.setLineDash(row.dashed ? [10, 8] : []); ctx.beginPath(); ctx.moveTo(x + 16, rowY); ctx.lineTo(x + 60, rowY); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = colors.ink; ctx.font = '15px Arial'; ctx.fillText(row.label, x + 76, rowY + 5); });
}

function drawPanelText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  words.forEach((word) => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; });
  if (line) lines.push(line);
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  return lines.length * lineHeight;
}

function drawAreaGroup(ctx, areas, title, color, panel, colors, startY) {
  const x = panel.x + 10; const width = panel.width - 20; let y = startY;
  ctx.fillStyle = color; ctx.fillRect(x, y, width, 30); ctx.fillStyle = '#ffffff'; ctx.font = '700 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(title, x + width / 2, y + 21); y += 34;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, Math.max(70, panel.y + panel.height - y - 10));
  ctx.textAlign = 'left'; ctx.fillStyle = colors.ink; ctx.font = '700 13px Arial';
  if (!areas.length) { ctx.font = '12px Arial'; ctx.fillStyle = colors.muted; ctx.fillText('Nenhuma área carregada', x + 10, y + 25); return y + 48; }
  const colWidth = width / 2; const rows = Math.ceil(areas.length / 2);
  areas.forEach((area, index) => { const col = index < rows ? 0 : 1; const row = col === 0 ? index : index - rows; const rowY = y + 22 + row * 18; const label = String(area.label || area.name).slice(0, 28); ctx.fillStyle = colors.ink; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${label}`, x + 9 + col * colWidth, rowY); });
  return y + rows * 18 + 22;
}

function drawPanel(ctx, model, panel, colors) {
  ctx.fillStyle = colors.paper; ctx.fillRect(panel.x, panel.y, panel.width, panel.height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  ctx.fillStyle = colors.green; ctx.fillRect(panel.x + 10, panel.y + 52, panel.width - 20, 54); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 20px Arial'; ctx.fillText('ÁREA DE INFLUÊNCIA', panel.x + panel.width / 2, panel.y + 76); ctx.font = '700 16px Arial'; ctx.fillText(`DESMONTE - ${model.meta.dateLabel}`, panel.x + panel.width / 2, panel.y + 97);
  ctx.fillStyle = colors.ink; ctx.textAlign = 'left'; ctx.font = '700 16px Arial'; ctx.fillText(model.meta.company || 'EMPRESA / OPERAÇÃO', panel.x + 12, panel.y + 34);
  let y = panel.y + 124; y = drawAreaGroup(ctx, model.areas.filter((area) => area.status === 'evacuar'), 'EVACUAR', colors.red, panel, colors, y); y += 18; drawAreaGroup(ctx, model.areas.filter((area) => area.status === 'liberado'), 'LIBERADO', colors.blue, panel, colors, y);
}

export function drawReport(canvas, model, config) {
  const width = config.report.canvasWidth; const height = config.report.canvasHeight; canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); const colors = config.report.colors; const map = config.report.map; const panel = config.report.panel;
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = colors.rule; ctx.lineWidth = 2; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.save(); ctx.beginPath(); ctx.rect(map.x, map.y, map.width, map.height); ctx.clip(); ctx.fillStyle = '#e8eef0'; ctx.fillRect(map.x, map.y, map.width, map.height); drawCoverImage(ctx, model.baseImage, map); ctx.restore();
  const all = [model.string?.entities || [], ...model.areas.map((area) => area.entities || [])].flat(); const bounds = model.boundsMode === 'manual' ? model.manualBounds : paddedBounds(mergeBounds([boundsOf(model.string?.entities || []), ...model.areas.map((area) => boundsOf(area.entities || []))])); const transform = makeTransform(bounds, map);
  drawGrid(ctx, map, transform, bounds, colors);
  if (transform) {
    model.areas.forEach((area) => (area.entities || []).forEach((entity) => drawHatchedEntity(ctx, entity, transform, area.status === 'evacuar' ? colors.red : colors.blue, area.status === 'evacuar' ? colors.redSoft : colors.blueSoft)));
    (model.string?.entities || []).forEach((entity) => drawEntity(ctx, entity, transform, colors.orange));
    const endpoints = getStringEndpoints(model.string?.entities || []); endpoints.forEach((point) => { if (model.radii.people > 0) { ctx.save(); ctx.setLineDash([18, 10]); ctx.strokeStyle = colors.greenLight; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(transform.x(point), transform.y(point), model.radii.people * transform.scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } if (model.radii.machine > 0) { ctx.save(); ctx.setLineDash([12, 10]); ctx.strokeStyle = colors.cyan; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(transform.x(point), transform.y(point), model.radii.machine * transform.scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } ctx.fillStyle = colors.orange; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(transform.x(point), transform.y(point), 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  }
  drawNorth(ctx, map); drawScale(ctx, map, transform, bounds); drawLegend(ctx, model, map, colors); drawPanel(ctx, { ...model, meta: { ...model.meta, dateLabel: model.meta.date ? new Date(`${model.meta.date}T12:00:00`).toLocaleDateString('pt-BR') : 'DATA NÃO INFORMADA' } }, panel, colors);
  ctx.fillStyle = colors.ink; ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.fillText(model.meta.location || 'Local não informado', map.x + 8, height - 20); ctx.textAlign = 'right'; ctx.fillText(model.meta.observation || 'Prévia técnica para conferência antes da emissão', width - 24, height - 20);
  return { bounds, endpointCount: getStringEndpoints(model.string?.entities || []).length };
}
