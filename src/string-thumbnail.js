// Miniatura geométrica de uma string (seção 03 do formulário). Módulo puro, sem DOM:
// ajusta as entidades a uma caixa quadrada preservando a proporção, inverte o eixo Y
// (norte para cima, como no croqui) e devolve marcação SVG. Aceita polyline, line, point
// e circle (centro em points[0], raio em unidades do mundo). Strings sem geometria recebem
// um marcador tracejado.

export const THUMBNAIL_SIZE = 48;
const THUMBNAIL_PADDING = 5;
const FILL_OPACITY = 0.22;
const STROKE_WIDTH = 1.5;
const DOT_RADIUS = 1.6;
const MIN_CIRCLE_RADIUS = 1;
const PLACEHOLDER_OPACITY = 0.45;

function finitePoints(entity) {
  return (entity?.points || []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
}

function circleRadius(entity) {
  const radius = Number(entity?.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

// Limites das entidades com laço explícito (strings grandes têm milhares de vértices).
function thumbnailBounds(item) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  (item?.entities || []).forEach((entity) => {
    const points = finitePoints(entity);
    const extent = entity?.type === 'circle' ? circleRadius(entity) : 0;
    points.forEach((point) => {
      minX = Math.min(minX, point.x - extent); maxX = Math.max(maxX, point.x + extent);
      minY = Math.min(minY, point.y - extent); maxY = Math.max(maxY, point.y + extent);
    });
  });
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// Devolve { size, shapes } com coordenadas já na caixa da miniatura, ou null sem geometria.
export function layoutStringThumbnail(item, { size = THUMBNAIL_SIZE, padding = THUMBNAIL_PADDING } = {}) {
  const bounds = thumbnailBounds(item);
  if (!bounds) return null;
  const inner = size - padding * 2;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = inner / (Math.max(width, height) || 1);
  const offsetX = padding + (inner - width * scale) / 2;
  const offsetY = padding + (inner - height * scale) / 2;
  const project = (point) => ({ x: offsetX + (point.x - bounds.minX) * scale, y: offsetY + (bounds.maxY - point.y) * scale });
  const shapes = [];
  (item.entities || []).forEach((entity) => {
    const points = finitePoints(entity);
    if (!points.length) return;
    if (entity.type === 'circle') {
      const center = project(points[0]);
      shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r: Math.max(circleRadius(entity) * scale, MIN_CIRCLE_RADIUS) });
      return;
    }
    if (entity.type === 'point' || points.length === 1) {
      points.forEach((point) => { const dot = project(point); shapes.push({ kind: 'dot', cx: dot.x, cy: dot.y }); });
      return;
    }
    // Mesma regra do croqui: polilinhas com 3 ou mais vértices recebem preenchimento, fechadas ou não.
    shapes.push({ kind: 'path', points: points.map(project), closed: entity.closed === true, filled: points.length >= 3 });
  });
  return { size, shapes };
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function shapeMarkup(shape, paint) {
  if (shape.kind === 'dot') return `<circle cx="${formatNumber(shape.cx)}" cy="${formatNumber(shape.cy)}" r="${DOT_RADIUS}" fill="${paint}"/>`;
  const stroke = `stroke="${paint}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"`;
  if (shape.kind === 'circle') return `<circle cx="${formatNumber(shape.cx)}" cy="${formatNumber(shape.cy)}" r="${formatNumber(shape.r)}" fill="${paint}" fill-opacity="${FILL_OPACITY}" ${stroke}/>`;
  const d = shape.points.map((point, index) => `${index ? 'L' : 'M'}${formatNumber(point.x)} ${formatNumber(point.y)}`).join('') + (shape.closed ? 'Z' : '');
  const fill = shape.filled ? `fill="${paint}" fill-opacity="${FILL_OPACITY}"` : 'fill="none"';
  return `<path d="${d}" ${fill} ${stroke}/>`;
}

// Marcação SVG completa. A cor vem da configuração (tipo de desmonte); sem cor válida usa o tom escuro
// do próprio texto (currentColor). O marcador sem geometria tem data-thumb="empty".
export function stringThumbnailSvg(item, { color, size = THUMBNAIL_SIZE, padding = THUMBNAIL_PADDING } = {}) {
  const paint = escapeAttribute(color || 'currentColor');
  const open = (state) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false" data-thumb="${state}">`;
  const layout = layoutStringThumbnail(item, { size, padding });
  if (!layout) {
    const inset = size * 0.22;
    const side = size - inset * 2;
    const dash = `fill="none" stroke="currentColor" stroke-opacity="${PLACEHOLDER_OPACITY}" stroke-width="${STROKE_WIDTH}"`;
    return `${open('empty')}<rect x="${formatNumber(inset)}" y="${formatNumber(inset)}" width="${formatNumber(side)}" height="${formatNumber(side)}" rx="${formatNumber(size * 0.08)}" stroke-dasharray="3 3" ${dash}/><path d="M${formatNumber(size * 0.36)} ${formatNumber(size / 2)}H${formatNumber(size * 0.64)}" stroke-linecap="round" ${dash}/></svg>`;
  }
  return `${open('geometry')}${layout.shapes.map((shape) => shapeMarkup(shape, paint)).join('')}</svg>`;
}
