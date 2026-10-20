import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { parseDxf, parseGeoJson } from '../src/dxf.js';
import { areaIntersectsContours, boundsOf, boundsOfContours, buildRadiusContours, dedupeEntities, differenceEntityWithContours, fitBoundsToAspect, flattenStringEntities, getStringEndpoints, intersectEntityWithContours, paddedBounds, pointIntersectsContours, unionContourPolygons } from '../src/geometry.js';
import { safeFileName } from '../src/pdf.js';
import { assignMissingBlockingPointColors, blockingPointLegendLabel, chooseBlockingPointColor, hasAdequateContrast, hexToRgb, isHexColor, pickBlockingPointColor, rgbToLab, settleBlockingPointColor, validateBlockingPointConfig } from '../src/points.js';
import { drawEntity, drawStringEntity, fitCanvasFontSize } from '../src/render.js';

const dxf = await fs.readFile(new URL('../POLIGONAIS/r030826.dxf', import.meta.url), 'latin1');
const parsed = parseDxf(dxf);
vm.runInThisContext(await fs.readFile(new URL('../vendor/polygon-clipping.min.js', import.meta.url), 'utf8'));
assert.equal(parsed.sourceType, 'dxf');
assert.ok(parsed.entities.length >= 3, 'o DXF de referência deve conter as três strings');
assert.ok(parsed.entities.every((entity) => entity.points.length >= 2), 'cada string precisa ter vértices');
assert.ok(getStringEndpoints(parsed.entities).length >= 3, 'as extremidades devem ser identificadas');
const contours = buildRadiusContours(parsed.entities, [700, 300]);
assert.equal(contours.length, 2, 'os dois raios devem gerar dois contornos únicos');
assert.ok(contours.every((contour) => contour.polygons.length === 1), 'cada raio precisa gerar um único cerco unificado');
const savedUnion = globalThis.polygonClipping.union;
globalThis.polygonClipping.union = () => { throw new Error('falha de união simulada'); };
const fallbackContours = buildRadiusContours(parsed.entities, [700]);
assert.equal(fallbackContours[0].polygons.length, 1, 'uma falha de união não pode desenhar cápsulas individuais');
assert.equal(fallbackContours[0].fallback, true, 'a falha de união precisa ser sinalizada como simplificação segura');
globalThis.polygonClipping.union = savedUnion;
globalThis.polygonClipping = { union: (...polygons) => polygons };
assert.equal(unionContourPolygons([[[[0, 0], [10, 0], [10, 10], [0, 0]]], [[[5, 0], [15, 0], [15, 10], [5, 0]]]]).length, 2, 'a normalização precisa aceitar polígonos válidos sem criar raios extras');
const bounds = boundsOf(parsed.entities);
const contourBounds = boundsOfContours(contours);
assert.ok(contourBounds.minX < bounds.minX && contourBounds.maxX > bounds.maxX, 'os raios precisam ampliar a extensão horizontal');
assert.ok(contourBounds.minY < bounds.minY && contourBounds.maxY > bounds.maxY, 'os raios precisam ampliar a extensão vertical');
assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, 'a extensão precisa ser válida');
const expanded = paddedBounds(bounds);
assert.ok(expanded.minX < bounds.minX && expanded.maxY > bounds.maxY, 'a extensão automática precisa ter margem');
const areaDxf = await fs.readFile(new URL('../ÁREA DE INFLUÊNCIA/DXF/EVACUAR.dxf', import.meta.url), 'latin1');
const structurePolygonsDxf = await fs.readFile(new URL('../ESTRUTURAS PROXIMAS/Pligonais das Estruturas Proximas.dxf', import.meta.url), 'latin1');
const structurePolygons = parseDxf(structurePolygonsDxf);
assert.ok(structurePolygons.entities.length >= 54, 'as poligonais novas devem conter as áreas das estruturas');
assert.ok(structurePolygons.entities.every((entity) => entity.closed && entity.points.length >= 3), 'cada poligonal de estrutura precisa ser fechada');
const combinedStructureDxf = await fs.readFile(new URL('../ESTRUTURAS PROXIMAS/ID - PONTOS + Pligonais das Estruturas Proximas.dxf', import.meta.url), 'latin1');
const combinedStructures = parseDxf(combinedStructureDxf);
assert.ok(combinedStructures.entities.length >= 54, 'o DXF combinado precisa conter as poligonais das estruturas');
assert.ok(combinedStructures.entities.every((entity) => entity.closed && entity.points.length >= 3), 'as poligonais combinadas precisam ser fechadas');
assert.equal(dedupeEntities(combinedStructures.entities).length, 48, 'as duplicatas geométricas do DXF combinado devem ser removidas no carregamento');
for (const source of ['ID - PONTOS.dwg', 'ID - PONTOS.dxf']) {
  const sourceStat = await fs.stat(new URL(`../ESTRUTURAS PROXIMAS/${source}`, import.meta.url));
  assert.ok(sourceStat.size > 0, `${source} precisa existir como fonte dos pontos atualizados`);
}
const parsedArea = parseDxf(areaDxf);
assert.ok(parsedArea.entities.length >= 10, 'o DXF de áreas de referência precisa ler os HATCHs');
assert.ok(parsedArea.entities.every((entity) => entity.closed), 'as áreas HATCH precisam ser fechadas');
assert.equal(dedupeEntities(parsedArea.entities).length, 11, 'as áreas de evacuação não devem perder geometrias distintas');
const releasedAreaDxf = await fs.readFile(new URL('../ÁREA DE INFLUÊNCIA/DXF/LIBERADO.dxf', import.meta.url), 'latin1');
const parsedReleasedArea = parseDxf(releasedAreaDxf);
assert.equal(dedupeEntities(parsedReleasedArea.entities).length, 34, 'as duplicatas geométricas das áreas liberadas devem ser removidas no carregamento');
const structureCatalog = JSON.parse(await fs.readFile(new URL('../data/structures.json', import.meta.url), 'utf8'));
const appConfig = JSON.parse(await fs.readFile(new URL('../config.json', import.meta.url), 'utf8'));
const appHtml = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const stylesSource = await fs.readFile(new URL('../styles.css', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
const renderSource = await fs.readFile(new URL('../src/render.js', import.meta.url), 'utf8');
const onlineBackend = await fs.readFile(new URL('../backend/Code.gs', import.meta.url), 'utf8');
assert.equal(appConfig.onlineCatalog.enabled, true, 'o catálogo online precisa estar habilitado');
assert.equal(appConfig.app.version, '1.20.14');
assert.equal(appConfig.defaultPreset.observation, 'Setor Técnico de Operações - Enaex Brasil.');
assert.equal(appConfig.defaultPreset.peopleRadius, 500);
assert.equal(appConfig.defaultPreset.machineRadius, 700);
assert.deepEqual(appConfig.defaultPreset.pointIconSizes, { firing: 48, blocking: 25, card: 30 });
assert.equal(appConfig.defaultPreset.areaNumberSize, 10);
assert.equal(appConfig.report.stringFillOpacity, 0.16);
assert.match(renderSource, /showLabel = true/);
assert.match(renderSource, /function drawStructurePositionLabel/);
assert.match(renderSource, /structure\.positions \|\| \[\]/, 'os rótulos precisam usar as posições reais do catálogo');
assert.match(renderSource, /structure\.points\.forEach\(\(point\) => drawStructurePositionLabel/);
const structureLabelOrder = renderSource.indexOf('structurePoints.forEach((structure) => structure.points.forEach((point) => drawStructurePositionLabel');
const stringDraftOrder = renderSource.indexOf('drawStringDraft(ctx, model.stringDrawing, transform, colors);');
assert.ok(structureLabelOrder > stringDraftOrder, 'os números das áreas precisam ser desenhados depois de todas as camadas do croqui');
assert.match(renderSource, /colors\.blueHatch/, 'a hachura azul deve usar a cor suavizada configurada');
assert.match(renderSource, /colors\.redHatch/, 'a hachura vermelha deve usar a cor suavizada configurada');
assert.match(renderSource, /const DEFAULT_STRING_FILL_OPACITY = 0\.16/, 'as strings precisam ter uma opacidade de preenchimento calibrada');
assert.match(renderSource, /function drawStringEntity/, 'as strings devem ter uma rotina de desenho própria');
assert.match(renderSource, /if \(entity\.closed && entity\.points\.length >= 3 && opacity\)/, 'somente poligonais fechadas com área devem receber preenchimento');
assert.match(renderSource, /drawStringEntity\(ctx, entity, transform, stringColor\(item, colors\), stringFillOpacity\)/, 'o preenchimento precisa usar a mesma cor da string');
assert.match(renderSource, /drawStringOutline\(ctx, entity, transform, stringColor\(item, colors\)\)/, 'as bordas precisam ser redesenhadas depois dos preenchimentos');
assert.match(renderSource, /drawHatchedEntity\(ctx, entity, transform, colors\.blueHatch, colors\.blueSoft, colors\.blue\)/, 'o contorno azul deve permanecer destacado');
assert.match(renderSource, /drawHatchedPolygon\(ctx, polygon, transform, colors\.redHatch, colors\.redSoft, colors\.red\)/, 'o contorno vermelho deve permanecer destacado');
assert.match(renderSource, /const hatchEntities = model\.areas\.filter\(\(area\) => area\.catalogId === 'estruturas-proximas'\)/, 'as hachuras precisam usar o DXF atualizado das estruturas');
assert.equal(appConfig.defaultPreset.structurePointsSource.dxf, 'ESTRUTURAS PROXIMAS/ID - PONTOS.dxf');
assert.equal(appConfig.areasProjeto.find((area) => area.id === 'estruturas-proximas')?.path, 'ESTRUTURAS PROXIMAS/Pligonais das Estruturas Proximas.dxf');
assert.equal(appConfig.ortomosaicos.length, 4, 'o catálogo deve conter o GeoTIFF principal e os três ortomosaicos atuais');
for (const ortho of appConfig.ortomosaicos) assert.ok((await fs.stat(new URL(`../${ortho.path}`, import.meta.url))).size > 0, `o ortomosaico ${ortho.path} precisa existir`);
assert.match(appHtml, /id="exportProjectButton"/);
assert.match(appHtml, /id="blastNumber"/);
assert.match(appHtml, /id="noticeImageButton"/);
assert.match(appHtml, /id="noticeCanvas"/);
assert.match(appHtml, /id="drawStringButton"/);
assert.match(appHtml, /id="finishStringButton"/);
assert.match(appHtml, /id="cancelStringButton"/);
assert.match(appHtml, /id="pointPlacementToolbar"/);
assert.match(appHtml, /id="finishPointPlacementButton"/);
assert.match(appHtml, /aria-live="polite"/);
assert.match(appHtml, /id="pointPlacementToolbar"[\s\S]*?id="reportCanvas"/);
assert.match(stylesSource, /\.point-placement-toolbar \{[^}]*width: min\(100%, 1200px\)/);
assert.match(stylesSource, /\.point-actions \{[^}]*flex: 0 1 492px/);
assert.match(stylesSource, /\.preview-stage \{ width: min\(100%, 1200px\)/);
assert.match(stylesSource, /#reportCanvas \{[^}]*width: 100%[^}]*max-height: none/);
assert.match(appSource, /function finishStringDrawing/);
assert.match(appSource, /function finishPointPlacement/);
assert.match(appSource, /pointPlacementSessionPoints/);
assert.match(appSource, /while \(existingNames\.has/);
assert.match(appSource, /event\.key === 'Escape'/);
assert.match(appSource, /point-name-input/);
assert.ok(!appSource.includes('window.prompt(`Nome do ${labels[type]}'), 'a inserção contínua não pode interromper cada ponto com uma caixa de nome');
assert.match(appSource, /function handleCanvasPointerDown/);
assert.match(appSource, /function handleCanvasPointerMove/);
assert.match(appSource, /type: 'point'/);
assert.match(renderSource, /function drawStringDraft/);
assert.match(renderSource, /\$\{item\.label \|\| item\.name \|\| 'REGIÃO'\} \(\$\{typeLabel\[item\.blastType\]/);
assert.match(renderSource, /export function drawNoticeTable/);
assert.match(renderSource, /ctx\.fillText\(regionsText, infoX \+ NOTICE_REGION_LABEL_WIDTH/);
assert.doesNotMatch(renderSource, /fitCanvasText\(ctx, noticeRegions\(model\)/, 'a linha de regiões não pode mais eliminar planos com reticências');
assert.ok(!renderSource.includes('config.report.noticeFooter'), 'a tabela não pode ser renderizada dentro do croqui');
assert.equal(appConfig.report.canvasHeight, 1512, 'o croqui deve preservar a altura original');
assert.deepEqual(appConfig.report.map, { x: 28, y: 35, width: 1280, height: 1422 }, 'o mapa deve preservar o enquadramento original');

const noticePlans = ['PP461026_B (Produção)', 'PP601026 (Produção)', 'PP611026 (Produção)', 'REG451026 (Regularização/Bloco)', 'R021026 (Regularização/Bloco)'].join(' · ');
const noticeMeasureContext = { font: '', measureText(text) { const size = Number.parseFloat(this.font); return { width: text.length * size * 0.55 }; } };
const noticeFontSize = fitCanvasFontSize(noticeMeasureContext, noticePlans, 867);
noticeMeasureContext.font = `${noticeFontSize}px Arial`;
assert.ok(noticeFontSize < 16, 'a lista de planos do projeto deve reduzir automaticamente a fonte');
assert.ok(noticeMeasureContext.measureText(noticePlans).width <= 867, 'os cinco planos completos precisam caber na linha');
assert.ok(noticePlans.endsWith('R021026 (Regularização/Bloco)'), 'a última região deve permanecer íntegra');

function fakeCanvasContext() {
  const calls = [];
  const ctx = {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    closePath: () => calls.push('closePath'),
    arc: () => calls.push('arc'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke')
  };
  for (const property of ['globalAlpha', 'fillStyle', 'strokeStyle']) {
    let value;
    Object.defineProperty(ctx, property, { get: () => value, set: (next) => { value = next; calls.push(`${property}:${next}`); } });
  }
  return ctx;
}

const identityTransform = { x: (point) => point.x, y: (point) => point.y, scale: 1 };
const closedString = { type: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] };
const closedContext = fakeCanvasContext();
drawStringEntity(closedContext, closedString, identityTransform, '#ff1111');
assert.equal(closedContext.calls.filter((call) => call === 'fill').length, 1, 'a poligonal fechada precisa receber preenchimento');
assert.equal(closedContext.calls.filter((call) => call === 'stroke').length, 1, 'a poligonal fechada precisa manter o contorno');
assert.ok(closedContext.calls.includes('globalAlpha:0.16'), 'o preenchimento precisa aplicar a opacidade configurada');
assert.ok(closedContext.calls.includes('fillStyle:#ff1111'), 'o preenchimento precisa usar a mesma cor do contorno');
assert.ok(closedContext.calls.includes('save') && closedContext.calls.includes('restore'), 'a opacidade precisa ficar isolada no estado do Canvas');

const openContext = fakeCanvasContext();
drawStringEntity(openContext, { type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, identityTransform, '#08df00');
assert.equal(openContext.calls.filter((call) => call === 'fill').length, 0, 'uma linha aberta não pode receber preenchimento');
assert.equal(openContext.calls.filter((call) => call === 'stroke').length, 1, 'uma linha aberta precisa manter o contorno');

const circleContext = fakeCanvasContext();
drawStringEntity(circleContext, { type: 'circle', points: [{ x: 5, y: 5 }], radius: 2 }, identityTransform, '#ffdd11');
assert.equal(circleContext.calls.filter((call) => call === 'arc').length, 1, 'um círculo precisa ser desenhado como arco');
assert.equal(circleContext.calls.filter((call) => call === 'fill').length, 1, 'um círculo de string precisa receber preenchimento');
assert.equal(circleContext.calls.filter((call) => call === 'stroke').length, 1, 'um círculo de string precisa manter o contorno');

const areaContext = fakeCanvasContext();
drawEntity(areaContext, closedString, identityTransform, '#1820d8');
assert.equal(areaContext.calls.filter((call) => call === 'fill').length, 0, 'áreas que não são strings não podem receber preenchimento de string');
assert.equal(areaContext.calls.filter((call) => call === 'stroke').length, 1, 'áreas existentes precisam manter o contorno');

assert.match(appHtml, /id="importProjectFile"/);
assert.match(appConfig.onlineCatalog.endpoint, /^https:\/\/script\.google\.com\/macros\/s\//, 'o endpoint online precisa ser um Web App do Apps Script');
assert.match(onlineBackend, /function doGet\(event\)/, 'o backend precisa expor leitura online');
assert.match(onlineBackend, /function doPost\(event\)/, 'o backend precisa expor publicação online');
assert.match(onlineBackend, /LockService\.getScriptLock\(\)/, 'a publicação online precisa serializar gravações');
assert.equal(structureCatalog.structures.length, 54, 'o catálogo deve conter as 54 estruturas nomeadas da planilha');
assert.equal(new Set(structureCatalog.structures.map((structure) => structure.id)).size, 54, 'os identificadores das estruturas devem ser únicos');
assert.equal(structureCatalog.structures.reduce((total, structure) => total + structure.positions.length, 0), 59, 'o catálogo deve preservar todas as 59 posições fornecidas');
assert.equal(structureCatalog.pointsSource.extractedPositions, 59, 'a origem dos pontos precisa registrar as 59 posições');
assert.equal(structureCatalog.structures.find((structure) => structure.id === '41')?.name, 'PORTARIA');
assert.equal(structureCatalog.structures.find((structure) => structure.id === '42')?.name, 'PILHA DE TOPSOIL');
assert.equal(structureCatalog.structures.find((structure) => structure.id === '40')?.name, 'ACESSO PRINCIPAL');
assert.ok(structureCatalog.structures.find((structure) => structure.id === '08')?.positions.length > 1, 'IDs compostos devem preservar posições repetidas');
assert.ok(structureCatalog.pageMap.width > 0 && structureCatalog.pageMap.height > 0, 'o catálogo deve guardar a extensão cartográfica da página fonte');

const geo = parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'EVACUAR' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] }));
assert.equal(geo.entities.length, 1);
assert.equal(geo.entities[0].closed, true);
assert.equal(flattenStringEntities([{ entities: parsed.entities }, { entities: parsed.entities.slice(0, 1) }]).length, parsed.entities.length + 1);
const closedContour = buildRadiusContours([{ type: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], [1]);
assert.equal(areaIntersectsContours([{ type: 'point', points: [{ x: 5, y: 5 }] }], closedContour), true, 'a poligonal fechada precisa receber buffer também no último segmento');
const contour = [{ polygons: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]], radius: 5 }];
assert.equal(areaIntersectsContours([{ type: 'polyline', closed: true, points: [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 4 }] }], contour), true);
assert.equal(areaIntersectsContours([{ type: 'polyline', closed: true, points: [{ x: 20, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 22 }, { x: 20, y: 20 }] }], contour), false);
assert.equal(pointIntersectsContours({ x: 5, y: 5 }, contour), true, 'um ponto dentro do contorno deve ser evacuado');
assert.equal(pointIntersectsContours({ x: 15, y: 15 }, contour), false, 'um ponto fora do contorno deve ser liberado');
assert.equal(pointIntersectsContours({ x: 0, y: 5 }, contour), true, 'um ponto sobre o limite do contorno deve ser evacuado');
const aspectBounds = fitBoundsToAspect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2);
assert.equal(aspectBounds.maxX - aspectBounds.minX, 20, 'a extensão deve cobrir a proporção horizontal do mapa');
globalThis.polygonClipping = { intersection: () => [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] };
assert.equal(intersectEntityWithContours({ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }] }, contour).length, 1, 'um sólido fechado precisa retornar a interseção para a hachura vermelha');
globalThis.polygonClipping = { difference: (subject) => subject };
assert.equal(differenceEntityWithContours({ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }] }, contour).length, 1, 'a base azul precisa aceitar a diferença geométrica dos raios');
assert.equal(safeFileName('Aviso de Detonação 04/08/2026'), 'aviso-de-detonacao-04-08-2026');
// Pontos de bloqueio: cor por ponto, legenda numerada e importação sem erro silencioso.
validateBlockingPointConfig(appConfig.report);
assert.equal(blockingPointLegendLabel(appConfig.report.legend.blockingPointLabel, 1), 'Ponto de Bloqueio #1', 'a legenda deve numerar os pontos de bloqueio a partir de #1');
assert.equal(blockingPointLegendLabel(appConfig.report.legend.blockingPointLabel, 12), 'Ponto de Bloqueio #12', 'a numeração da legenda não pode ter limite');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointColors: ['#ff0000', '#FF0000'] }), /repetida/, 'a paleta não pode repetir cores');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointColors: ['vermelho'] }), /Cor inválida/, 'a paleta precisa conter apenas cores hexadecimais');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, legend: { blockingPointLabel: 'Bloqueio' } }), /\{number\}/, 'o rótulo da legenda precisa conter o número');
assert.ok(isHexColor('#00e0b0') && !isHexColor('#00e0b') && !isHexColor('verde'), 'somente cores #rrggbb são aceitas');
const testPalette = ['#111111', '#222222', '#333333'];
assert.equal(pickBlockingPointColor(testPalette, ['#111111'], () => 0), '#222222', 'o sorteio deve preferir cores ainda não usadas');
assert.equal(pickBlockingPointColor(testPalette, ['#111111', '#222222'], () => 0.999), '#333333', 'o último sorteio precisa cair na última cor livre');
assert.ok(testPalette.includes(pickBlockingPointColor(testPalette, testPalette, () => 0.5)), 'com a paleta esgotada, qualquer cor da paleta pode ser sorteada');
const importedPoints = [{ x: 1, y: 1, label: 'Ponto de bloqueio 1' }, { x: 2, y: 2, label: 'Ponto de bloqueio 2', color: '#222222' }, { x: 3, y: 3, label: 'Ponto de bloqueio 3' }];
assert.equal(assignMissingBlockingPointColors(importedPoints, testPalette, () => 0), 2, 'pontos de projetos antigos sem cor devem receber cor ao importar');
assert.equal(importedPoints[1].color, '#222222', 'cores já salvas no projeto não podem ser trocadas');
assert.notEqual(importedPoints[0].color, '#222222', 'o sorteio deve evitar a cor já usada por outro ponto');
assert.notEqual(importedPoints[2].color, importedPoints[0].color, 'pontos importados sem cor devem ficar com cores distintas quando a paleta permitir');
assert.throws(() => assignMissingBlockingPointColors([{ x: 1, y: 1, color: 'azul' }], testPalette), /cor inválida/, 'cor inválida na importação precisa interromper o processo');
assert.match(renderSource, /blockingPointLegendLabel\(legendSettings\.blockingPointLabel, index \+ 1\)/, 'a legenda deve ter uma linha numerada por ponto de bloqueio');
assert.match(renderSource, /label: legendSettings\.blockingPointDefaultLabel/, 'sem pontos de bloqueio, a legenda mostra a entrada genérica configurada');
assert.match(renderSource, /rows\.push\(\{ icon: 'card', label: legendSettings\.cardPointLabel \}\)/, 'a entrada de entrega de cartões deve sempre aparecer na legenda');
assert.match(renderSource, /footerConfig\.locationLabel/, 'o rodapé deve usar o rótulo configurado para o ponto de entrega dos cartões');
assert.ok(!renderSource.includes("label: 'PONTOS DE BLOQUEIO'"), 'a legenda não pode agrupar os pontos de bloqueio inseridos em uma única linha');
assert.match(renderSource, /drawBlockingMarker\(ctx, point, transform, config\.report\.blockingIcon/, 'cada ponto de bloqueio precisa desenhar o cavalete com a geometria configurada');
assert.match(renderSource, /paint\(color, 0, true\)/, 'o corpo do cavalete precisa usar a cor do ponto e receber as listras');
assert.match(renderSource, /if \(outline\) paint\(outline\.color, outline\.width, false\)/, 'o contorno do cavalete precisa ser opcional e vir da configuração');
assert.ok(!appSource.includes('cavalete-bloqueio.png'), 'o cavalete agora é vetorial; o PNG antigo não pode mais ser carregado');
assert.match(appSource, /refreshBlockingColor\(record\)/, 'cada ponto inserido precisa escolher cor pelo fundo ao redor');
assert.match(appSource, /sampleBlockingFootprint\(background, point, blockingFootprintRadius\(\), contrast\.sampleStep\)/, 'a cor precisa ser julgada pela área do próprio ícone, com passo configurado');
assert.match(appSource, /settleBlockingPointColor\(\{/, 'a decisão de cor precisa usar a regra pura de points.js');
assert.match(appSource, /if \(contrast && !contrast\.adequate\) notify\(LOW_CONTRAST_MESSAGE/, 'o aviso de baixo contraste precisa ser a única mensagem do gesto');
assert.match(appSource, /ensureContours\(\); annotateStructurePolygons\(\); return drawBlockingBackground/, 'o fundo precisa usar anéis e anotações atuais antes de medir');
assert.match(renderSource, /if \(halo\) paint\(halo\.color/, 'o halo precisa desenhar uma camada por fora do contorno');
assert.match(appSource, /validateBlockingPointConfig\(state\.config\.report\)/, 'a paleta precisa ser validada ao carregar a configuração');
assert.match(appSource, /assignMissingBlockingPointColors\(/, 'projetos antigos precisam receber cores ao importar');
assert.match(stylesSource, /\.point-swatch\.blocking \{[^}]*var\(--point-color/, 'a lista de pontos precisa mostrar a cor de cada ponto de bloqueio');
// Distinção visual: ΔE CIE76 entre as cores dos pontos e contra as cores fixas que o croqui já usa.
const labOf = (hex) => {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((index) => lin(parseInt(hex.slice(index, index + 2), 16)));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const colorDistance = (a, b) => { const [la, aa, ba] = labOf(a); const [lb, ab, bb] = labOf(b); return Math.hypot(la - lb, aa - ab, ba - bb); };
const blockingPalette = appConfig.report.blockingPointColors;
const fixedMapColors = Object.values(appConfig.report.colors).filter((value) => /^#[0-9a-f]{6}$/i.test(value));
blockingPalette.forEach((color, index) => {
  blockingPalette.slice(index + 1).forEach((other) => assert.ok(colorDistance(color, other) >= 40, `as cores ${color} e ${other} ficam parecidas demais para distinguir os pontos (ΔE < 40)`));
  fixedMapColors.forEach((mapColor) => assert.ok(colorDistance(color, mapColor) >= 30, `a cor ${color} se confunde com a cor fixa ${mapColor} do croqui (ΔE < 30)`));
});
const blockingIcon = appConfig.report.blockingIcon;
const insideIconFrame = (value) => value >= 0 && value <= blockingIcon.viewBox;
assert.equal(blockingIcon.stripes.color, '#ffffff', 'as listras do cavalete precisam ser brancas, como na identidade original');
blockingIcon.boards.forEach((board) => assert.ok([board.x, board.x + board.width].every(insideIconFrame) && [board.y, board.y + board.height].every(insideIconFrame), 'as tábuas do cavalete precisam caber no quadro'));
blockingIcon.posts.forEach((post) => assert.ok([post.x, post.x + post.width].every(insideIconFrame) && [post.y, post.y + post.height].every(insideIconFrame), 'os suportes do cavalete precisam caber no quadro'));
blockingIcon.legs.forEach((leg) => assert.ok([leg.x1, leg.x2, leg.y1, leg.y2].every(insideIconFrame), 'as pernas do cavalete precisam caber no quadro'));
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, stripes: { ...blockingIcon.stripes, color: 'branco' } } }), /stripes\.color/, 'a listra do cavalete precisa ter cor válida');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, boards: [] } }), /pelo menos uma tábua/, 'o cavalete precisa ter pelo menos uma tábua');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, stripes: { ...blockingIcon.stripes, period: 0.05 } } }), /pelo menos 1 unidade/, 'um período de listra muito pequeno travaria o desenho');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, boards: [null] } }), /precisa ser um objeto/, 'itens nulos da geometria precisam ser recusados com o caminho do erro');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, boards: [{ x: 150, y: 8, width: 10, height: 5 }] } }), /caber no quadro/, 'tábuas fora do quadro precisam ser recusadas');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, legs: [{ x1: 10, y1: 29, x2: -40, y2: 90, width: 4 }] } }), /caber no quadro/, 'pernas fora do quadro precisam ser recusadas');
// Contraste com o fundo: a cor do ponto precisa se destacar da área que o ícone cobre.
const contrastRule = appConfig.report.blockingPointContrast;
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointContrast: undefined }), /blockingPointContrast precisa estar configurado/, 'a regra de contraste é obrigatória');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointContrast: { ...contrastRule, requiredShare: 1.5 } }), /não pode passar de 1/, 'a parcela exigida não pode passar de 100%');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointContrast: { ...contrastRule, footprintRatio: 0 } }), /footprintRatio precisa ser maior que zero/, 'a área amostrada precisa ter tamanho');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingIcon: { ...blockingIcon, halo: { color: 'branco', width: 1 } } }), /halo\.color/, 'o halo precisa de cor válida');
const greenBackground = Array.from({ length: 40 }, () => rgbToLab([38, 70, 45]));
const brownBackground = Array.from({ length: 40 }, () => rgbToLab(hexToRgb('#8d5a2b')));
const onGreen = chooseBlockingPointColor({ palette: blockingPalette, usedColors: [], backgroundLabs: greenBackground, contrast: contrastRule, random: () => 0 });
assert.equal(onGreen.adequate, true, 'sobre fundo verde escuro precisa existir cor adequada na paleta');
assert.ok(hasAdequateContrast(onGreen.color, greenBackground, contrastRule), 'a cor escolhida precisa se destacar do fundo');
const onBrown = chooseBlockingPointColor({ palette: blockingPalette, usedColors: [], backgroundLabs: brownBackground, contrast: contrastRule, random: () => 0 });
assert.equal(onBrown.adequate, true, 'sobre o solo marrom também precisa existir cor adequada');
assert.notEqual(onBrown.color, '#8d5a2b', 'sobre o solo marrom a cor marrom não pode ser escolhida');
const withoutContrast = chooseBlockingPointColor({ palette: ['#8d5a2b'], usedColors: [], backgroundLabs: brownBackground, contrast: contrastRule, random: () => 0 });
assert.equal(withoutContrast.adequate, false, 'sem cor adequada, a escolha precisa sinalizar o baixo contraste');
const secondOnGreen = chooseBlockingPointColor({ palette: blockingPalette, usedColors: [onGreen.color], backgroundLabs: greenBackground, contrast: contrastRule, random: () => 0 });
assert.notEqual(secondOnGreen.color, onGreen.color, 'cores já usadas por outros pontos devem ser evitadas quando há alternativas adequadas');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointContrast: { ...contrastRule, minimumDeltaE: 150 } }), /não pode passar de 100/, 'o ΔE mínimo não pode passar do limite da escala CIELAB');
assert.throws(() => validateBlockingPointConfig({ ...appConfig.report, blockingPointContrast: { ...contrastRule, sampleStep: 1.5 } }), /inteiro/, 'o passo de amostragem precisa ser inteiro de pixels');
const keptColor = settleBlockingPointColor({ palette: blockingPalette, currentColor: onGreen.color, otherColors: [], backgroundLabs: greenBackground, contrast: contrastRule, random: () => 0 });
assert.equal(keptColor.color, onGreen.color, 'uma cor que ainda se destaca e não se repete deve ser mantida');
assert.equal(keptColor.changed, false);
const replacedDuplicate = settleBlockingPointColor({ palette: blockingPalette, currentColor: onGreen.color, otherColors: [onGreen.color], backgroundLabs: greenBackground, contrast: contrastRule, random: () => 0 });
assert.notEqual(replacedDuplicate.color, onGreen.color, 'uma cor repetida por outro ponto deve ser trocada quando há cor livre adequada');
assert.equal(replacedDuplicate.changed, true);
const inevitableDuplicate = settleBlockingPointColor({ palette: ['#e4007c'], currentColor: '#e4007c', otherColors: ['#e4007c'], backgroundLabs: greenBackground, contrast: contrastRule, random: () => 0 });
assert.equal(inevitableDuplicate.color, '#e4007c', 'sem alternativa livre, uma cor adequada que já se repete deve ser mantida');
const fromBrown = settleBlockingPointColor({ palette: blockingPalette, currentColor: '#8d5a2b', otherColors: [], backgroundLabs: brownBackground, contrast: contrastRule, random: () => 0 });
assert.notEqual(fromBrown.color, '#8d5a2b', 'uma cor que se confunde com o fundo deve ser trocada');
const unmeasuredKept = settleBlockingPointColor({ palette: blockingPalette, currentColor: '#3ddc84', otherColors: [], backgroundLabs: [], contrast: contrastRule, random: () => 0 });
assert.equal(unmeasuredKept.color, '#3ddc84', 'sem amostras do fundo a cor atual não pode mudar sem motivo');
assert.equal(unmeasuredKept.measured, false, 'a decisão sem amostras precisa dizer que não foi medida');
const unmeasuredNew = settleBlockingPointColor({ palette: blockingPalette, otherColors: [], backgroundLabs: [], contrast: contrastRule, random: () => 0 });
assert.ok(blockingPalette.includes(unmeasuredNew.color), 'um ponto novo sem amostras recebe uma cor da paleta');
assert.equal(unmeasuredNew.measured, false);
console.log(`PASS: DXF ${parsed.entities.length} entidades, ${getStringEndpoints(parsed.entities).length} extremidades, GeoJSON e nome de arquivo validados.`);
