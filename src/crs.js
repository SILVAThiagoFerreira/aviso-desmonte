const PROJECT_CRS = 'EPSG:5534';
const GEOTIFF_CRS = 'EPSG:29194';

function ensureDefinitions() {
  if (!globalThis.proj4) return;
  globalThis.proj4.defs(GEOTIFF_CRS, '+proj=utm +zone=24 +south +ellps=aust_SA +towgs84=-57,1,-41,0,0,0,0 +units=m +no_defs');
  globalThis.proj4.defs(PROJECT_CRS, '+proj=utm +zone=24 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs');
}

function transformPoint(point, from = GEOTIFF_CRS, to = PROJECT_CRS) {
  if (!globalThis.proj4) throw new Error('O conversor de CRS não carregou. Recarregue a página.');
  ensureDefinitions();
  const [x, y] = globalThis.proj4(from, to, [point.x, point.y]);
  return { x, y };
}

export function transformBounds(bounds, from = GEOTIFF_CRS, to = PROJECT_CRS) {
  if (!bounds || from === to) return bounds;
  const corners = [
    transformPoint({ x: bounds.minX, y: bounds.minY }, from, to),
    transformPoint({ x: bounds.minX, y: bounds.maxY }, from, to),
    transformPoint({ x: bounds.maxX, y: bounds.minY }, from, to),
    transformPoint({ x: bounds.maxX, y: bounds.maxY }, from, to),
  ];
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

export { GEOTIFF_CRS, PROJECT_CRS };
