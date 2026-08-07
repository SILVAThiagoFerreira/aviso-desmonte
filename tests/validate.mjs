import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseDxf, parseGeoJson } from '../src/dxf.js';
import { boundsOf, getStringEndpoints, paddedBounds } from '../src/geometry.js';
import { safeFileName } from '../src/pdf.js';

const dxf = await fs.readFile(new URL('../POLIGONAIS/r030826.dxf', import.meta.url), 'latin1');
const parsed = parseDxf(dxf);
assert.equal(parsed.sourceType, 'dxf');
assert.ok(parsed.entities.length >= 3, 'o DXF de referência deve conter as três strings');
assert.ok(parsed.entities.every((entity) => entity.points.length >= 2), 'cada string precisa ter vértices');
assert.ok(getStringEndpoints(parsed.entities).length >= 3, 'as extremidades devem ser identificadas');
const bounds = boundsOf(parsed.entities);
assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, 'a extensão precisa ser válida');
const expanded = paddedBounds(bounds);
assert.ok(expanded.minX < bounds.minX && expanded.maxY > bounds.maxY, 'a extensão automática precisa ter margem');
const areaDxf = await fs.readFile(new URL('../ÁREA DE INFLUÊNCIA/DXF/EVACUAR.dxf', import.meta.url), 'latin1');
const parsedArea = parseDxf(areaDxf);
assert.ok(parsedArea.entities.length >= 10, 'o DXF de áreas de referência precisa ler os HATCHs');
assert.ok(parsedArea.entities.every((entity) => entity.closed), 'as áreas HATCH precisam ser fechadas');

const geo = parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'EVACUAR' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] }));
assert.equal(geo.entities.length, 1);
assert.equal(geo.entities[0].closed, true);
assert.equal(safeFileName('Aviso de Detonação 04/08/2026'), 'aviso-de-detonacao-04-08-2026');
console.log(`PASS: DXF ${parsed.entities.length} entidades, ${getStringEndpoints(parsed.entities).length} extremidades, GeoJSON e nome de arquivo validados.`);
