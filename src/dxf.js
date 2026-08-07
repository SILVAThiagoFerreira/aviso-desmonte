function numberValue(value, context) {
  const number = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error(`Coordenada inválida em ${context}.`);
  return number;
}

function readEntityPairs(pairs, start) {
  const values = [];
  let cursor = start;
  while (cursor < pairs.length && pairs[cursor][0] !== '0') {
    values.push(pairs[cursor]);
    cursor += 1;
  }
  return { values, next: cursor };
}

function pointsFromPairs(values, xCode = '10', yCode = '20') {
  const points = [];
  let pendingX = null;
  values.forEach(([code, value]) => {
    if (code === xCode) pendingX = numberValue(value, `grupo ${xCode}`);
    if (code === yCode && pendingX !== null) {
      points.push({ x: pendingX, y: numberValue(value, `grupo ${yCode}`) });
      pendingX = null;
    }
  });
  return points;
}

function layerFrom(values) {
  return values.find(([code]) => code === '8')?.[1] || '0';
}

function flagFrom(values) {
  const value = values.find(([code]) => code === '70')?.[1];
  return value === undefined ? 0 : Number.parseInt(value, 10) || 0;
}

function parsePolyline(pairs, start, type) {
  const header = readEntityPairs(pairs, start);
  const values = header.values;
  const entities = [];
  const layer = layerFrom(values);
  const closed = (flagFrom(values) & 1) === 1;
  if (type === 'LWPOLYLINE') {
    const points = pointsFromPairs(values);
    if (points.length >= 2) entities.push({ type: 'polyline', points, closed, layer });
    return { entities, next: header.next };
  }

  let cursor = header.next;
  const points = [];
  while (cursor < pairs.length && pairs[cursor][0] === '0' && pairs[cursor][1] === 'VERTEX') {
    const vertex = readEntityPairs(pairs, cursor + 1);
    const vertexPoints = pointsFromPairs(vertex.values);
    if (vertexPoints[0]) points.push(vertexPoints[0]);
    cursor = vertex.next;
  }
  if (cursor < pairs.length && pairs[cursor][0] === '0' && pairs[cursor][1] === 'SEQEND') {
    cursor = readEntityPairs(pairs, cursor + 1).next;
  }
  if (points.length >= 2) entities.push({ type: 'polyline', points, closed, layer });
  return { entities, next: cursor };
}

function parseGeoJsonObject(value) {
  const features = value.type === 'FeatureCollection' ? value.features : [value];
  const entities = [];
  features.forEach((feature) => {
    const geometry = feature.type === 'Feature' ? feature.geometry : feature;
    if (!geometry) return;
    const layer = feature.properties?.name || feature.properties?.id || 'GeoJSON';
    const add = (coords, closed = false) => {
      const points = coords.map(([x, y]) => ({ x: Number(x), y: Number(y) }));
      if (points.length >= 2 && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        entities.push({ type: 'polyline', points, closed, layer });
      }
    };
    if (geometry.type === 'LineString') add(geometry.coordinates);
    if (geometry.type === 'MultiLineString') geometry.coordinates.forEach((line) => add(line));
    if (geometry.type === 'Polygon') geometry.coordinates.forEach((ring) => add(ring, true));
    if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => add(ring, true)));
    if (geometry.type === 'Point') {
      const [x, y] = geometry.coordinates;
      if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) entities.push({ type: 'point', points: [{ x: Number(x), y: Number(y) }], closed: false, layer });
    }
  });
  return entities;
}

export function parseGeoJson(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('O arquivo GeoJSON não contém JSON válido.'); }
  const entities = parseGeoJsonObject(value);
  if (!entities.length) throw new Error('O GeoJSON não contém linhas, polígonos ou pontos utilizáveis.');
  return { sourceType: 'geojson', entities, unsupported: [] };
}

export function parseDxf(text) {
  if (typeof text !== 'string' || text.trim().length < 20) throw new Error('O DXF está vazio ou incompleto.');
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (rawLines.length % 2 !== 0) rawLines.pop();
  const pairs = [];
  for (let index = 0; index < rawLines.length; index += 2) pairs.push([rawLines[index].trim(), rawLines[index + 1].trim()]);
  const entities = [];
  const unsupported = new Set();
  const entitiesStart = pairs.findIndex(([code, value]) => code === '2' && value === 'ENTITIES');
  if (entitiesStart < 0) throw new Error('O DXF não possui uma seção ENTITIES.');
  const entitiesEnd = pairs.findIndex((pair, index) => index > entitiesStart && pair[0] === '0' && pair[1] === 'ENDSEC');
  let cursor = entitiesStart + 1;
  const end = entitiesEnd > 0 ? entitiesEnd : pairs.length;
  while (cursor < end) {
    if (pairs[cursor][0] !== '0') { cursor += 1; continue; }
    const type = pairs[cursor][1];
    if (type === 'ENDSEC' || type === 'EOF') { cursor += 1; continue; }
    if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const parsed = parsePolyline(pairs, cursor + 1, type);
      entities.push(...parsed.entities);
      cursor = parsed.next;
      continue;
    }
    const entity = readEntityPairs(pairs, cursor + 1);
    const layer = layerFrom(entity.values);
    if (type === 'LINE') {
      const points = pointsFromPairs(entity.values).slice(0, 2);
      if (points.length === 2) entities.push({ type: 'line', points, closed: false, layer });
    } else if (type === 'POINT') {
      const points = pointsFromPairs(entity.values).slice(0, 1);
      if (points.length) entities.push({ type: 'point', points, closed: false, layer });
    } else if (type === 'CIRCLE') {
      const points = pointsFromPairs(entity.values).slice(0, 1);
      const radiusValue = entity.values.find(([code]) => code === '40')?.[1];
      const radius = radiusValue === undefined ? NaN : numberValue(radiusValue, 'raio do círculo');
      if (points.length && Number.isFinite(radius) && radius > 0) entities.push({ type: 'circle', points, radius, closed: true, layer });
    } else if (type === 'HATCH') {
      const boundaryIndex = entity.values.findIndex(([code]) => code === '93');
      const points = boundaryIndex >= 0 ? pointsFromPairs(entity.values.slice(boundaryIndex + 1)) : [];
      if (points.length >= 3) entities.push({ type: 'polyline', points, closed: true, layer });
    } else if (type === 'SPLINE') {
      const points = pointsFromPairs(entity.values, '11', '21');
      if (points.length >= 2) entities.push({ type: 'polyline', points, closed: false, layer });
      else unsupported.add(type);
    } else if (!['SECTION', 'ENDSEC', 'SEQEND', 'VERTEX', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK', 'INSERT', '3DFACE', 'SOLID', 'TRACE', 'TEXT', 'MTEXT', 'VIEWPORT'].includes(type)) {
      unsupported.add(type);
    }
    cursor = entity.next;
  }
  if (!entities.length) throw new Error('Nenhuma entidade geométrica utilizável foi encontrada no DXF.');
  return { sourceType: 'dxf', entities, unsupported: [...unsupported] };
}
