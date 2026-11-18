// Furos de perfuração (OPIT e similares) importados como strings de desmonte.
// Módulo puro, sem DOM: valida a configuração `holeStrings`, reconhece os furos
// de um DXF e converte o contorno externo de cada conjunto de furos em uma
// polilinha fechada que passa pelo centro dos furos da extremidade.

// Escala relativa do deslocamento determinístico usado para desempatar pontos
// colineares na triangulação (não é um limite do produto).
const JITTER_RELATIVE = 1e-9;
// Área mínima para um laço ser região, relativa ao quadrado da extensão dos furos.
const MIN_REGION_AREA_RELATIVE = 1e-7;
const MIN_HOLES_FLOOR = 3;
const MAX_ALPHA_FACTOR = 10;
const MAX_ATTACH_FACTOR = 10;
const MAX_HOLES_CEILING = 20000;

function finiteNumber(value, label) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} precisa ser um número finito.`);
  return number;
}

function formatCount(value) {
  return Number(value).toLocaleString('pt-BR');
}

export function validateHoleStringConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('A configuração holeStrings é obrigatória em config.json.');
  if (typeof config.enabled !== 'boolean') throw new Error('holeStrings.enabled precisa ser verdadeiro ou falso.');
  const minHoles = finiteNumber(config.minHoles, 'holeStrings.minHoles');
  if (!Number.isInteger(minHoles) || minHoles < MIN_HOLES_FLOOR) throw new Error(`holeStrings.minHoles precisa ser um inteiro maior ou igual a ${MIN_HOLES_FLOOR}.`);
  const maxHoles = finiteNumber(config.maxHoles, 'holeStrings.maxHoles');
  if (!Number.isInteger(maxHoles) || maxHoles < minHoles || maxHoles > MAX_HOLES_CEILING) throw new Error(`holeStrings.maxHoles precisa ser um inteiro entre minHoles e ${MAX_HOLES_CEILING}.`);
  const alphaFactor = finiteNumber(config.alphaFactor, 'holeStrings.alphaFactor');
  if (alphaFactor < 1 || alphaFactor > MAX_ALPHA_FACTOR) throw new Error(`holeStrings.alphaFactor precisa estar entre 1 e ${MAX_ALPHA_FACTOR}.`);
  const isolatedAttachFactor = finiteNumber(config.isolatedAttachFactor, 'holeStrings.isolatedAttachFactor');
  if (isolatedAttachFactor < 0 || isolatedAttachFactor > MAX_ATTACH_FACTOR) throw new Error(`holeStrings.isolatedAttachFactor precisa estar entre 0 e ${MAX_ATTACH_FACTOR}.`);
  const maxCircleRadius = finiteNumber(config.maxCircleRadius, 'holeStrings.maxCircleRadius');
  if (maxCircleRadius <= 0) throw new Error('holeStrings.maxCircleRadius precisa ser maior que zero.');
  const duplicateToleranceM = finiteNumber(config.duplicateToleranceM, 'holeStrings.duplicateToleranceM');
  if (duplicateToleranceM < 0) throw new Error('holeStrings.duplicateToleranceM não pode ser negativo.');
  const zeroLengthToleranceM = finiteNumber(config.zeroLengthToleranceM, 'holeStrings.zeroLengthToleranceM');
  if (zeroLengthToleranceM < 0) throw new Error('holeStrings.zeroLengthToleranceM não pode ser negativo.');
  return { enabled: config.enabled, minHoles, maxHoles, alphaFactor, isolatedAttachFactor, maxCircleRadius, duplicateToleranceM, zeroLengthToleranceM };
}

// Separa os furos das demais entidades. POINT é um furo; CIRCLE pequeno (raio
// até maxCircleRadius) é um furo pelo centro; LINE sem comprimento em planta é
// o "Theoretical Hole" vertical do OPIT, que repete o furo e não forma string.
// Tudo o mais permanece em `rest`.
export function extractHoles(entities = [], config) {
  const holes = [];
  const rest = [];
  entities.forEach((entity) => {
    const layer = entity.layer || '0';
    const first = entity.points?.[0];
    if (entity.type === 'point' && entity.points?.length === 1) {
      holes.push({ x: first.x, y: first.y, layer });
    } else if (entity.type === 'circle' && entity.points?.length === 1 && Number(entity.radius) > 0 && Number(entity.radius) <= config.maxCircleRadius) {
      holes.push({ x: first.x, y: first.y, layer });
    } else if (entity.type === 'line' && entity.points?.length === 2) {
      const last = entity.points[1];
      if (Math.hypot(last.x - first.x, last.y - first.y) <= config.zeroLengthToleranceM) holes.push({ x: first.x, y: first.y, layer });
      else rest.push(entity);
    } else {
      rest.push(entity);
    }
  });
  return { holes, rest };
}

// Um furo que aparece como POINT, CIRCLE e LINE no mesmo lugar é um só furo.
export function uniqueHoles(holes, toleranceM) {
  const seen = new Set();
  const unique = [];
  holes.forEach((hole) => {
    const key = toleranceM > 0
      ? `${Math.round(hole.x / toleranceM)},${Math.round(hole.y / toleranceM)}`
      : `${hole.x},${hole.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(hole);
  });
  return unique;
}

// Círculo circunscrito de um triângulo. Retorna Infinity para triângulo degenerado.
function circumradius(a, b, c) {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (!(twiceArea > 0)) return Infinity;
  return (ab * bc * ca) / (2 * twiceArea);
}

// Verdadeiro quando p está dentro do círculo circunscrito de (a, b, c),
// qualquer que seja a orientação do triângulo.
function insideCircumcircle(a, b, c, p) {
  const ax = a.x - p.x; const ay = a.y - p.y;
  const bx = b.x - p.x; const by = b.y - p.y;
  const cx = c.x - p.x; const cy = c.y - p.y;
  const det = (ax * ax + ay * ay) * (bx * cy - cx * by)
    - (bx * bx + by * by) * (ax * cy - cx * ay)
    + (cx * cx + cy * cy) * (ax * by - bx * ay);
  const orientation = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return orientation > 0 ? det > 0 : det < 0;
}

function boundsSpan(points) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  });
  return { span: Math.max(maxX - minX, maxY - minY) || 1, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

// Triangulação de Delaunay (Bowyer-Watson) sobre os furos. Retorna índices de
// triângulos reais, sem os vértices do supertriângulo.
function delaunayTriangles(points) {
  const count = points.length;
  const { span, centerX, centerY } = boundsSpan(points);
  const local = points.map((point, index) => ({
    x: point.x - centerX + ((index * 7919) % 1009) / 1009 * span * JITTER_RELATIVE,
    y: point.y - centerY + ((index * 104729) % 1013) / 1013 * span * JITTER_RELATIVE,
  }));
  local.push({ x: -20 * span, y: -span }, { x: 0, y: 20 * span }, { x: 20 * span, y: -span });
  const vertexCount = count + 3;
  let triangles = [[count, count + 1, count + 2]];
  for (let index = 0; index < count; index += 1) {
    const point = local[index];
    const bad = [];
    const kept = [];
    triangles.forEach((triangle) => {
      if (insideCircumcircle(local[triangle[0]], local[triangle[1]], local[triangle[2]], point)) bad.push(triangle);
      else kept.push(triangle);
    });
    const edges = new Map();
    bad.forEach(([a, b, c]) => {
      [[a, b], [b, c], [c, a]].forEach(([u, v]) => {
        const key = u < v ? u * vertexCount + v : v * vertexCount + u;
        const entry = edges.get(key);
        if (entry) entry.count += 1;
        else edges.set(key, { u, v, count: 1 });
      });
    });
    triangles = kept;
    edges.forEach(({ u, v, count: uses }) => {
      if (uses === 1) triangles.push([u, v, index]);
    });
  }
  return triangles.filter(([a, b, c]) => a < count && b < count && c < count);
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(a.x + t * dx - point.x, a.y + t * dy - point.y);
}

function orientation(p, q, r) {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

// Cruzamento estrito entre dois segmentos. Tocar uma extremidade não conta.
function segmentsCrossProperly(a, b, c, d) {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a); const o4 = orientation(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Inserir `hole` entre os vértices k e k+1 não pode cruzar nenhuma outra aresta.
function insertionKeepsSimple(contours, contourIndex, k, hole) {
  const contour = contours[contourIndex];
  const a = contour[k];
  const b = contour[(k + 1) % contour.length];
  return contours.every((other, otherIndex) => other.every((c, j) => {
    if (otherIndex === contourIndex && j === k) return true;
    const d = other[(j + 1) % other.length];
    return !segmentsCrossProperly(a, hole, c, d) && !segmentsCrossProperly(hole, b, c, d);
  }));
}

// Furo isolado que fica fora dos contornos, a até `maxDistance` de uma aresta, é
// incorporado ao contorno mais próximo (entre os dois vértices vizinhos) quando a
// inserção não cruza outra aresta. Furos dentro de um contorno não são incorporados.
function attachIsolatedHoles(contours, candidates, maxDistance) {
  const attached = new Set();
  if (!(maxDistance > 0)) return attached;
  candidates.forEach((hole, candidateIndex) => {
    if (contours.some((contour) => pointInPolygon(hole, contour))) return;
    const options = [];
    contours.forEach((contour, contourIndex) => contour.forEach((a, k) => {
      const distance = segmentDistance(hole, a, contour[(k + 1) % contour.length]);
      if (distance <= maxDistance) options.push({ contourIndex, k, distance });
    }));
    options.sort((left, right) => left.distance - right.distance);
    const chosen = options.find((option) => insertionKeepsSimple(contours, option.contourIndex, option.k, hole));
    if (!chosen) return;
    contours[chosen.contourIndex].splice(chosen.k + 1, 0, { x: hole.x, y: hole.y });
    attached.add(candidateIndex);
  });
  return attached;
}

// Contorno externo do conjunto de furos. Triângulos da Delaunay com circunraio
// maior que alphaFactor × mediana são descartados (alfa-forma); as arestas que
// sobram na fronteira formam laços. Só laços de área positiva (externos) viram
// contorno. Furos fora do contorno e próximos a ele são incorporados; os demais
// isolados e os internos ao contorno são informados.
export function holeOutline(points, { alphaFactor, isolatedAttachFactor }) {
  const result = { contours: [], isolated: [], interior: [], attached: 0, interiorLoops: 0, triangles: 0, alphaM: NaN, medianCircumradiusM: NaN, spacingM: NaN };
  if (points.length < MIN_HOLES_FLOOR) {
    result.isolated = points.map((_, index) => index);
    return result;
  }
  const triangles = delaunayTriangles(points);
  const vertexCount = points.length;
  const edgeLengths = new Map();
  triangles.forEach(([a, b, c]) => {
    [[a, b], [b, c], [c, a]].forEach(([u, v]) => {
      const key = Math.min(u, v) * vertexCount + Math.max(u, v);
      if (!edgeLengths.has(key)) edgeLengths.set(key, Math.hypot(points[u].x - points[v].x, points[u].y - points[v].y));
    });
  });
  result.spacingM = median([...edgeLengths.values()]);
  // Orientação anti-horária em torno de cada triângulo: arestas de fronteira ficam com sentido consistente.
  const oriented = triangles.map(([a, b, c]) => {
    const turn = orientation(points[a], points[b], points[c]);
    const vertices = turn < 0 ? [a, c, b] : [a, b, c];
    return { vertices, radius: circumradius(points[vertices[0]], points[vertices[1]], points[vertices[2]]) };
  });
  result.triangles = oriented.length;
  const medianRadius = median(oriented.map((item) => item.radius).filter(Number.isFinite));
  result.medianCircumradiusM = medianRadius;
  if (!Number.isFinite(medianRadius)) {
    result.isolated = points.map((_, index) => index);
    return result;
  }
  const alpha = alphaFactor * medianRadius;
  result.alphaM = alpha;
  const kept = oriented.filter((item) => item.radius <= alpha).map((item) => item.vertices);
  const directed = new Set();
  kept.forEach(([a, b, c]) => {
    directed.add(a * vertexCount + b); directed.add(b * vertexCount + c); directed.add(c * vertexCount + a);
  });
  // Aresta de fronteira: aresta orientada cuja inversa não pertence a nenhum triângulo mantido.
  const outgoing = new Map();
  directed.forEach((key) => {
    const u = Math.floor(key / vertexCount); const v = key % vertexCount;
    if (directed.has(v * vertexCount + u)) return;
    if (!outgoing.has(u)) outgoing.set(u, []);
    outgoing.get(u).push(v);
  });
  const used = new Set();
  const loops = [];
  outgoing.forEach((targets, start) => {
    targets.forEach((first) => {
      if (used.has(start * vertexCount + first)) return;
      const loop = [start];
      used.add(start * vertexCount + first);
      let current = first;
      let guard = 0;
      while (current !== start) {
        guard += 1;
        const next = guard <= directed.size ? (outgoing.get(current) || []).find((candidate) => !used.has(current * vertexCount + candidate)) : undefined;
        if (next === undefined) throw new Error('O contorno dos furos não fechou. Verifique se o arquivo contém furos duplicados ou mal posicionados.');
        loop.push(current);
        used.add(current * vertexCount + next);
        current = next;
      }
      loops.push(loop);
    });
  });
  const signedArea = (loop) => loop.reduce((sum, vertex, index) => {
    const next = loop[(index + 1) % loop.length];
    return sum + points[vertex].x * points[next].y - points[next].x * points[vertex].y;
  }, 0) / 2;
  // Fileiras de furos alinhados geram laços de área quase nula: não são regiões.
  const { span } = boundsSpan(points);
  const minRegionArea = span * span * MIN_REGION_AREA_RELATIVE;
  const outerLoops = loops.filter((loop) => loop.length >= MIN_HOLES_FLOOR && signedArea(loop) > minRegionArea);
  result.interiorLoops = loops.filter((loop) => loop.length >= MIN_HOLES_FLOOR && signedArea(loop) < -minRegionArea).length;
  const onKept = new Uint8Array(points.length);
  kept.forEach((vertices) => vertices.forEach((vertex) => { onKept[vertex] = 1; }));
  const onOuter = new Uint8Array(points.length);
  outerLoops.forEach((loop) => loop.forEach((vertex) => { onOuter[vertex] = 1; }));
  const contours = outerLoops.map((loop) => loop.map((vertex) => ({ x: points[vertex].x, y: points[vertex].y })));
  const isolatedIndices = [];
  points.forEach((_, index) => {
    if (!onKept[index]) isolatedIndices.push(index);
    else if (!onOuter[index]) result.interior.push(index);
  });
  const attachDistance = isolatedAttachFactor * result.spacingM;
  const attachedPositions = attachIsolatedHoles(contours, isolatedIndices.map((index) => points[index]), attachDistance);
  result.attached = attachedPositions.size;
  result.isolated = isolatedIndices.filter((_, position) => !attachedPositions.has(position));
  result.contours = contours;
  return result;
}

// Converte o resultado de parseDxf: furos viram contornos fechados e as demais
// entidades permanecem. Sem furos suficientes ou sem área fechada, o arquivo
// segue como antes e a razão vai em `notices`.
export function convertHoleEntities(parsed, config) {
  const extraction = extractHoles(parsed.entities, config);
  if (!config.enabled || !extraction.holes.length) return { ...parsed, holes: null, notices: [] };
  const holes = uniqueHoles(extraction.holes, config.duplicateToleranceM);
  if (holes.length > config.maxHoles) {
    throw new Error(`O arquivo tem ${formatCount(holes.length)} furos; o limite para contorno automático é ${formatCount(config.maxHoles)}. Divida o arquivo por desmonte.`);
  }
  const plural = holes.length === 1 ? 'furo' : 'furos';
  const verb = holes.length === 1 ? 'não forma' : 'não formam';
  if (holes.length < config.minHoles) {
    return { ...parsed, holes: null, notices: [`${formatCount(holes.length)} ${plural} ${verb} contorno (mínimo ${config.minHoles}); mantido como ponto.`] };
  }
  const outline = holeOutline(holes, config);
  if (!outline.contours.length) {
    return { ...parsed, holes: null, notices: [`${formatCount(holes.length)} ${plural} ${verb} área fechada; nenhum contorno foi gerado.`] };
  }
  const layers = [...new Set(holes.map((hole) => hole.layer))];
  const contourVertices = outline.contours.reduce((sum, contour) => sum + contour.length, 0);
  const summary = {
    count: holes.length,
    layers,
    contours: outline.contours.length,
    contourVertices,
    attached: outline.attached,
    isolated: outline.isolated.length,
    interior: outline.interior.length,
  };
  const contourEntities = outline.contours.map((points) => ({ type: 'polyline', points, closed: true, layer: layers[0] || '0' }));
  const contourText = outline.contours.length === 1 ? '1 contorno' : `${formatCount(outline.contours.length)} contornos`;
  const extras = [
    outline.isolated.length ? `${formatCount(outline.isolated.length)} furo(s) isolado(s) ficaram de fora` : '',
  ].filter(Boolean);
  const notice = `${formatCount(holes.length)} ${plural} → ${contourText} com ${formatCount(contourVertices)} vértices${extras.length ? `; ${extras.join('; ')}` : ''}.`;
  return { ...parsed, entities: [...contourEntities, ...extraction.rest], holes: summary, notices: [notice] };
}
