import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { parseDxf, parseGeoJson } from '../src/dxf.js';
import { areaIntersectsContours, boundsOf, boundsOfContours, buildRadiusContours, dedupeEntities, differenceEntityWithContours, fitBoundsToAspect, flattenStringEntities, getStringEndpoints, intersectEntityWithContours, paddedBounds, pointIntersectsContours, stringsOverlap, unionContourPolygons } from '../src/geometry.js';
import { safeFileName } from '../src/pdf.js';
import { assignFiringPointIdentity, assignMissingBlockingPointColors, blockingPointLegendLabel, chooseBlockingPointColor, hasAdequateContrast, hexToRgb, isHexColor, pickBlockingPointColor, rgbToLab, settleBlockingPointColor, validateBlockingPointConfig } from '../src/points.js';
import { drawCardArrow, drawEntity, drawPointIcon, drawProhibitedIcon, drawStringEntity, fitCanvasFontSize } from '../src/render.js';
import { clampZoom, validatePreviewZoomConfig, wheelZoomFactor } from '../src/preview-zoom.js';
import { layoutStringThumbnail, stringThumbnailSvg } from '../src/string-thumbnail.js';
import { placePopover } from '../src/point-popover.js';
import { convertHoleEntities, extractHoles, holeOutline, uniqueHoles, validateHoleStringConfig } from '../src/holes.js';

const firingOptions = Array.from({ length: 20 }, () => ({}));
assignFiringPointIdentity(firingOptions, () => 0);
assert.equal(new Set(firingOptions.map(point => point.color)).size, 20, 'as cores dos pontos de disparo devem ser distintas');
assert.deepEqual(firingOptions.map(point => point.optionNumber), Array.from({ length: 20 }, (_, index) => index + 1));
const savedFiringOptions = JSON.parse(JSON.stringify(firingOptions));
assignFiringPointIdentity(savedFiringOptions, () => 0.5);
assert.deepEqual(savedFiringOptions, firingOptions, 'cores e números devem ser preservados ao reabrir o projeto');

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
const previewZoomSource = await fs.readFile(new URL('../src/preview-zoom.js', import.meta.url), 'utf8');
const onlineBackend = await fs.readFile(new URL('../backend/Code.gs', import.meta.url), 'utf8');
assert.equal(appConfig.onlineCatalog.enabled, true, 'o catálogo online precisa estar habilitado');
assert.equal(appConfig.app.version, '1.20.36');
// Zoom de visualização: configuração, validação e cálculos puros. Não pode alterar o canvas exportado.
const previewZoom = appConfig.previewZoom;
validatePreviewZoomConfig(previewZoom);
assert.equal(previewZoom.minZoom, 1, 'o zoom mínimo precisa ser o enquadramento ajustado (100%)');
assert.ok(previewZoom.maxZoom > previewZoom.minZoom, 'o zoom máximo precisa ser maior que o mínimo');
assert.throws(() => validatePreviewZoomConfig(undefined), /previewZoom precisa estar configurado/, 'sem configuração o zoom não pode iniciar');
assert.throws(() => validatePreviewZoomConfig({ ...previewZoom, minZoom: 0.5 }), /minZoom/, 'zoom mínimo abaixo de 100% deixaria o croqui menor que a moldura');
assert.throws(() => validatePreviewZoomConfig({ ...previewZoom, maxZoom: 1 }), /maxZoom/, 'zoom máximo precisa ser maior que o mínimo');
assert.throws(() => validatePreviewZoomConfig({ ...previewZoom, buttonStep: 1 }), /buttonStep/, 'o passo dos botões precisa alterar o zoom');
assert.throws(() => validatePreviewZoomConfig({ ...previewZoom, wheelSensitivity: 0 }), /wheelSensitivity/, 'a sensibilidade da roda precisa ser positiva');
assert.throws(() => validatePreviewZoomConfig({ ...previewZoom, dragThresholdPx: -1 }), /dragThresholdPx/, 'o limiar do arraste não pode ser negativo');
assert.equal(clampZoom(0.2, previewZoom), previewZoom.minZoom, 'zoom abaixo do mínimo deve ser limitado');
assert.equal(clampZoom(99, previewZoom), previewZoom.maxZoom, 'zoom acima do máximo deve ser limitado');
assert.equal(clampZoom(2, previewZoom), 2, 'zoom dentro da faixa deve ser mantido');
const wheelIn = wheelZoomFactor({ deltaY: -100, deltaMode: 0 }, 800, previewZoom);
const wheelOut = wheelZoomFactor({ deltaY: 100, deltaMode: 0 }, 800, previewZoom);
assert.ok(wheelIn > 1 && wheelOut < 1 && Math.abs(wheelIn * wheelOut - 1) < 1e-12, 'a roda para cima amplia e para baixo reduz, com fatores simétricos');
assert.ok(Math.abs(wheelZoomFactor({ deltaY: 3, deltaMode: 1 }, 800, previewZoom) - wheelZoomFactor({ deltaY: 48, deltaMode: 0 }, 800, previewZoom)) < 1e-12, 'uma linha da roda equivale a 16 px');
assert.doesNotMatch(previewZoomSource, /drawReport|canvas\.width\s*=|canvas\.height\s*=|toDataURL/, 'o zoom de visualização não pode redesenhar nem alterar o bitmap do canvas');
assert.match(appHtml, /<div class="preview-stage" id="previewStage" role="region" tabindex="0"[^>]*><canvas id="reportCanvas"/, 'o canvas precisa ficar dentro da moldura rolável da prévia');
for (const id of ['previewZoomOut', 'previewZoomLevel', 'previewZoomIn', 'previewZoomReset']) assert.match(appHtml, new RegExp(`id="${id}"`), `o controle ${id} precisa existir`);
assert.match(appSource, /setupPreviewZoom\(\{ stage: \$\('previewStage'\), canvas: \$\('reportCanvas'\)/, 'o zoom precisa ser ligado à moldura e ao canvas da prévia');
assert.match(previewZoomSource, /setPointerCapture/, 'arrastar com botão central ou direito precisa capturar o ponteiro');
assert.match(previewZoomSource, /!\[0, 1, 2\]\.includes\(event\.button\)/, 'arrastar precisa aceitar botão esquerdo, central e direito');
assert.match(previewZoomSource, /addEventListener\('contextmenu', \(event\) => event\.preventDefault\(\)\)/, 'o menu de contexto não pode abrir sobre a prévia');
assert.match(previewZoomSource, /addEventListener\('auxclick', \(event\) => \{ if \(event\.button === 1\) event\.preventDefault\(\); \}\)/, 'o botão central não pode disparar a rolagem automática do navegador');
assert.match(previewZoomSource, /style\.setProperty\('transition', 'none', 'important'\)/, 'a largura do canvas precisa mudar sem transição, senão a âncora do cursor fica defasada');
assert.match(stylesSource, /\.preview-stage \{ width: min\(100%, 1200px\); overflow: auto;/, 'a moldura da prévia precisa rolar quando ampliada');
assert.match(stylesSource, /\.preview-stage\.is-zoomed \{ max-height: /, 'a prévia ampliada precisa de altura limitada à janela');
assert.match(stylesSource, /\.preview-stage #reportCanvas \{ max-width: none;/, 'o canvas ampliado não pode ser limitado pelo max-width');
assert.doesNotMatch(stylesSource, /^\.preview-panel \{[^\n]*(position: sticky|max-height|overflow)/m, 'a prévia precisa rolar junto com a página, sem sticky, altura máxima ou rolagem própria');
assert.doesNotMatch(stylesSource, /\.area-list \{[^}]*overflow/, 'a lista de estruturas não pode ter rolagem própria dentro do formulário');
assert.match(appSource, /function canvasPixelPoint\(event\) \{[^\n]*canvas\.getBoundingClientRect\(\)/, 'as coordenadas do clique precisam usar a caixa CSS atual do canvas, que acompanha o zoom');
assert.equal(appConfig.report.colors.reducedHighlight, '#f2b600', 'o realce do raio reduzido na legenda precisa vir do config.json');
assert.equal(appConfig.defaultPreset.observation, 'Setor Técnico de Operações - Enaex Brasil.');
assert.equal(appConfig.defaultPreset.peopleRadius, 500);
assert.equal(appConfig.defaultPreset.machineRadius, 300, 'o raio padrão para máquinas e equipamentos deve ser 300 m');
assert.ok(appConfig.report.blockingIcon.shadow.blur >= 0 && appConfig.report.blockingIcon.shadow.blur <= 4, 'a sombra do cavalete deve ser discreta (desfoque de 0 a 4 px)');
assert.match(renderSource, /shadowBlur = shadow\.blur/, 'o cavalete precisa aplicar a sombra configurada na silhueta externa');
assert.ok(appConfig.report.radiusStroke.haloWidth > appConfig.report.radiusStroke.width,'o halo dos raios precisa ser mais largo que o traço');
assert.ok(appConfig.report.stringFillOpacity > 0 && appConfig.report.stringFillOpacity <= 1, 'a opacidade do preenchimento das regiões deve estar entre 0 e 1');
assert.deepEqual(appConfig.defaultPreset.pointIconSizes, { firing: 48, blocking: 25, card: 30 });
assert.equal(appConfig.defaultPreset.areaNumberSize, 10);
assert.equal(appConfig.report.stringFillOpacity, 0.6, 'o preenchimento das regiões de desmonte deve ter opacidade de 0,6 (40% de transparência)');
assert.match(renderSource, /showLabel = true/);
assert.match(renderSource, /function drawStructurePositionLabel/);
assert.match(renderSource, /structure\.positions \|\| \[\]/, 'os rótulos precisam usar as posições reais do catálogo');
assert.match(renderSource, /structure\.points\.forEach\(\(point\) => drawStructurePositionLabel/);
const structureLabelOrder = renderSource.indexOf('structurePoints.forEach((structure) => structure.points.forEach((point) => drawStructurePositionLabel');
const stringDraftOrder = renderSource.indexOf('drawStringDraft(ctx, model.stringDrawing, transform, colors);');
assert.ok(structureLabelOrder > stringDraftOrder, 'os números das áreas precisam ser desenhados depois de todas as camadas do croqui');
assert.match(renderSource, /colors\.blueHatch/, 'a hachura azul deve usar a cor suavizada configurada');
assert.match(renderSource, /colors\.redHatch/, 'a hachura vermelha deve usar a cor suavizada configurada');
assert.match(renderSource, /const DEFAULT_STRING_FILL_OPACITY = 0\.6/, 'as strings precisam ter uma opacidade de preenchimento calibrada');
assert.match(renderSource, /function drawStringEntity/, 'as strings devem ter uma rotina de desenho própria');
assert.match(renderSource, /if \(entity\.points\?\.length >= 3 && opacity && entityPath/,'poligonais com 3 ou mais vértices devem receber preenchimento, fechadas ou não');
assert.match(renderSource, /drawStringEntity\(ctx, entity, transform, stringColor\(item, colors\), stringFillOpacity\)/, 'o preenchimento padrão precisa usar a cor da própria string');
assert.match(renderSource, /outsideProductionPieces\(item, blastItems, colors\)/, 'a sobreposição precisa preencher só a parte fora da produção, não a string inteira');
assert.match(renderSource, /drawStringOutline\(ctx, entity, transform, stringColor\(item, colors\)\)/, 'as bordas precisam ser redesenhadas depois dos preenchimentos');
const overlapStrings = [
  { name: 'PP561026', blastType: 'production', entities: [{ type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }, { x: 0, y: 0 }] }] },
  { name: 'PC561026', blastType: 'precut', entities: [{ type: 'polyline', closed: true, points: [{ x: 0.2, y: 0 }, { x: 10, y: 0.3 }, { x: 5, y: 8 }] }] },
  { name: 'PC_LONGE', blastType: 'precut', entities: [{ type: 'polyline', closed: false, points: [{ x: 50, y: 50 }, { x: 60, y: 50 }] }] },
  { name: 'PP_DENTRO', blastType: 'production', entities: [{ type: 'polyline', closed: false, points: [{ x: 2, y: 2 }, { x: 3, y: 2 }] }] },
  { name: 'REG_CRUZA', blastType: 'regularization', entities: [{ type: 'polyline', closed: false, points: [{ x: -5, y: 4 }, { x: 20, y: 4 }] }] },
];
assert.ok(stringsOverlap(overlapStrings[0], overlapStrings[1]), 'strings com a mesma geometria devem ser sobrepostas');
assert.ok(!stringsOverlap(overlapStrings[0], overlapStrings[2]), 'strings distantes não podem ser marcadas como sobrepostas');
assert.ok(stringsOverlap(overlapStrings[0], overlapStrings[3]), 'uma string dentro do preenchimento da outra deve ser sobreposta');
assert.ok(stringsOverlap(overlapStrings[0], overlapStrings[4]), 'segmentos que se cruzam devem ser sobrepostos');
assert.match(renderSource, /overlappingWithProduction\(blastItems, colors\)/, 'strings sobrepostas à produção precisam ser identificadas na prancha');
assert.match(renderSource, /if \(outside\?\.has\(entity\)\) fillPolygonPieces\(ctx, outside\.get\(entity\), transform, stringColor\(item, colors\), stringFillOpacity\)/, 'a parte fora da produção de outro arquivo precisa manter a cor da classificação');
assert.match(renderSource, /production\.some\(\(other\) => stringSourceKey\(other\) !== stringSourceKey\(item\) && stringsOverlap\(other, item\)\)/, 'a sobreposição só vale entre arquivos diferentes');
assert.doesNotMatch(renderSource, /lineDashOffset|SHARED_STRING_DASH|drawSharedString/, 'o contorno de sobreposição deve ser sólido, sem a rotina de divisão antiga');
const duplicatedRadius = buildRadiusContours(flattenStringEntities([{ id: 'a', entities: parsed.entities }]), [700, 300]);
const doubledRadius = buildRadiusContours(flattenStringEntities([{ id: 'a', entities: parsed.entities }, { id: 'b', entities: parsed.entities }]), [700, 300]);
assert.deepEqual(doubledRadius.map((item) => [item.radius, item.fallback === true, item.polygons]), duplicatedRadius.map((item) => [item.radius, item.fallback === true, item.polygons]), 'uma string adicionada duas vezes não pode alterar o raio calculado');
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
assert.match(appHtml, /<input type="checkbox" id="peopleRadiusReduced"/, 'o raio reduzido de pessoas precisa ser uma caixa de seleção');
assert.match(appHtml, /<input type="checkbox" id="machineRadiusReduced"/, 'o raio reduzido de máquinas precisa ser uma caixa de seleção');
assert.match(appHtml, /id="pointPlacementToolbar"/);
assert.match(appHtml, /id="finishPointPlacementButton"/);
assert.match(appHtml, /aria-live="polite"/);
assert.match(appHtml, /id="pointPlacementToolbar"[\s\S]*?id="reportCanvas"/);
assert.match(stylesSource, /\.point-placement-toolbar \{[^}]*width: min\(100%, 1200px\)/);
assert.match(stylesSource, /\.point-actions \{[^}]*flex: 1 1 560px/);
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
assert.ok(closedContext.calls.includes('globalAlpha:0.6'), 'o preenchimento precisa aplicar a opacidade configurada');
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
assert.equal(appConfig.report.legend.firingPointDefaultLabel, 'PONTO DE DISPARO (PDE NORTE)', 'o rótulo do ponto de disparo sem estrutura deve ser PONTO DE DISPARO (PDE NORTE), como no aviso de referência');
assert.ok(!renderSource.includes("'PONTOS DE DISPARO'"), 'o rótulo genérico PONTOS DE DISPARO não pode mais aparecer na legenda');
assert.match(renderSource, /fillStyle = item\.reduced \? colors\.reducedHighlight : colors\.ink/, 'o rótulo do raio reduzido deve usar a cor de colors e os demais rótulos a tinta normal');
assert.match(renderSource, /item\.reduced \? `700 \$\{fontSize\}px Arial` : /, 'o rótulo do raio reduzido deve ser desenhado em negrito (700)');
assert.match(renderSource, /labelWeight\);/, 'o ajuste de fonte dos rótulos deve medir com o mesmo peso usado no desenho');
assert.match(renderSource, /RAIO DE SEGURANÇA REDUZIDO/, 'o rótulo do raio reduzido deve usar a redação RAIO DE SEGURANÇA REDUZIDO');
assert.doesNotMatch(renderSource, /labelX - 3 \* scale/, 'o realce amarelo não pode mais ter retângulo atrás do texto');
const boldLabelContext = { font: '', measureText(text) { const size = Number.parseFloat(this.font.replace(/^700 /, '')); return { width: text.length * size * (this.font.startsWith('700 ') ? 0.6 : 0.5) }; } };
const legendLabel = 'Cx(r)=500 m · RAIO DE SEGURANÇA REDUZIDO · PESSOAS';
const regularLabelSize = fitCanvasFontSize(boldLabelContext, legendLabel, 300, 12, 7);
const boldLabelSize = fitCanvasFontSize(boldLabelContext, legendLabel, 300, 12, 7, 700);
assert.ok(boldLabelSize < regularLabelSize, 'o ajuste de fonte deve medir o rótulo em negrito e reduzi-lo quando não couber');
boldLabelContext.font = `700 ${boldLabelSize}px Arial`;
assert.ok(boldLabelContext.measureText(legendLabel).width <= 300, 'o rótulo reduzido em negrito precisa caber na largura da legenda');
const cssRule = (selector) => stylesSource.split(/\r?\n/).find((line) => line.startsWith(`${selector} {`)) || '';
const neutralButtonRules = ['.radius-generated-button', '.edit-button'].map(cssRule);
assert.ok(neutralButtonRules.every((rule) => /color: var\(--ink\)/.test(rule)), 'Usar distância do site e Mover/Concluir devem usar tinta neutra');
assert.ok(neutralButtonRules.every((rule) => !/--green|#147a59|#f2faf7|rgba\(20,122,89/.test(rule)), 'Usar distância do site e Mover/Concluir não podem usar verde');
assert.match(cssRule('.radius-generated-button:hover'), /border-color: var\(--ink\)/, 'Usar distância do site deve escurecer a borda ao passar o mouse');
assert.match(cssRule('.radius-generated-button:active'), /background: var\(--ink\)/, 'Usar distância do site deve ter estado pressionado em tinta');
assert.match(cssRule('.edit-button:hover'), /border-color: var\(--ink\); color: var\(--ink\); background: #eef1f3/, 'Mover e Concluir devem ter hover neutro');
assert.doesNotMatch(renderSource, /ffe36b/, 'a faixa amarela cheia da legenda não pode voltar');
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
assert.match(renderSource, /if \(halo\) \{[\s\S]*?paint\(halo\.color/,'o halo precisa desenhar uma camada por fora do contorno');
assert.match(appSource, /validateBlockingPointConfig\(state\.config\.report\)/, 'a paleta precisa ser validada ao carregar a configuração');
assert.match(appSource, /assignMissingBlockingPointColors\(/, 'projetos antigos precisam receber cores ao importar');
assert.match(stylesSource, /\.point-icon canvas \{ display: block;/, 'a lista de pontos mostra o ícone real do croqui, em canvas, e não um marcador genérico');
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
// Miniaturas das strings (seção 03): proporção preservada, norte para cima, círculo, marcador sem geometria e escape da cor.
const nearly = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
const thumbLine = layoutStringThumbnail({ entities: [{ type: 'polyline', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], closed: false }] }, { size: 48, padding: 4 });
assert.equal(thumbLine.shapes[0].kind, 'path');
nearly(thumbLine.shapes[0].points[0].x, 4, 'a miniatura deve manter a margem à esquerda');
nearly(thumbLine.shapes[0].points[0].y, 34, 'o vértice mais ao sul deve ficar embaixo (Y invertido)');
nearly(thumbLine.shapes[0].points[1].x, 44, 'a proporção 2:1 deve preencher a largura interna');
nearly(thumbLine.shapes[0].points[1].y, 14, 'o vértice mais ao norte deve ficar em cima');
const thumbCircle = layoutStringThumbnail({ entities: [{ type: 'circle', points: [{ x: 50, y: 50 }], radius: 10 }] }, { size: 48, padding: 4 }).shapes[0];
assert.equal(thumbCircle.kind, 'circle');
nearly(thumbCircle.cx, 24, 'o círculo deve ficar centralizado');
nearly(thumbCircle.r, 20, 'o raio do círculo deve acompanhar a escala da miniatura');
assert.equal(layoutStringThumbnail({ entities: [] }), null, 'string sem geometria não gera miniatura de geometria');
assert.match(stringThumbnailSvg({ entities: [] }), /data-thumb="empty"/, 'string sem geometria mostra o marcador tracejado');
assert.match(stringThumbnailSvg({ sourceType: 'site', entities: [{ type: 'polyline', points: [{ x: 1, y: 1 }, { x: 5, y: 9 }], closed: false }] }, { color: '#08df00' }), /data-thumb="geometry"[\s\S]*stroke="#08df00"/, 'strings desenhadas no croqui precisam de miniatura na cor do tipo');
const thumbDxf = stringThumbnailSvg({ entities: parsed.entities }, { color: '#ff1111' });
assert.match(thumbDxf, /data-thumb="geometry"/);
assert.ok(!/NaN|Infinity/.test(thumbDxf), 'a miniatura do DXF não pode conter coordenadas inválidas');
assert.ok(!stringThumbnailSvg({ entities: parsed.entities }, { color: '"><script>' }).includes('<script>'), 'a cor vinda da configuração precisa ser escapada');
assert.match(appSource, /import \{ stringThumbnailSvg \} from '\.\/src\/string-thumbnail\.js\?v=1\.20\.28'/, 'a miniatura precisa ser importada com o cache-busting da versão atual');
assert.match(appSource, /select\.addEventListener\('change', \(\) => \{ item\.blastType = select\.value; paintStringThumb\(thumb, item\); render\(\); \}\)/, 'trocar o tipo precisa atualizar a cor da miniatura');
assert.match(appSource, /row\.append\(thumb, copy, visibility, remove\)/, 'a miniatura fica à esquerda do bloco de nome, sem alterar select, olho e remover');
assert.match(appHtml, /app\.js\?v=1\.20\.36/, 'o index precisa carregar o app.js da versão atual');
assert.match(stylesSource, /\.string-thumb \{ display: grid;/, 'a miniatura precisa de estilo próprio');
// Interface enxuta: textos redundantes saem da página (dicas úteis ficam em title), barras sem filete vermelho grosso.
for (const removed of ['Role o mouse sobre o croqui', 'Selecione um tipo para começar', 'Prancha atualizada em', 'O ano do aviso é preenchido', 'DXF disponíveis na pasta local', 'Sem limite prático', 'Preencha os dados, carregue as geometrias', 'A prancha do croqui permanece independente', 'IMAGEM INDEPENDENTE', 'VISUALIZAÇÃO DO MAPA', 'EDIÇÃO DO CROQUI', 'CONFIGURAÇÃO DO AVISO', 'Base operacional: PDFs', 'Não exige Google Maps']) assert.ok(!appHtml.includes(removed) && !appSource.includes(removed), `o texto "${removed}" deve sair da interface`);
assert.ok(!appHtml.includes('previewCaption') && !appSource.includes('previewCaption'), 'a legenda "Prancha atualizada" foi removida, inclusive do JavaScript');
// Vermelho restaurado (v1.20.28): topo dos painéis, numeração, rótulos e filetes das barras do croqui.
assert.match(stylesSource, /\.control-panel \{ min-width: 0; padding: 22px 22px 26px; border: 1px solid var\(--line\); border-top: 3px solid var\(--enaex-red\);/, 'o topo vermelho dos painéis precisa voltar');
assert.match(stylesSource, /\.section-heading > span \{ color: var\(--enaex-red\)/, 'a numeração das seções volta em vermelho');
assert.match(stylesSource, /\.eyebrow, \.section-kicker \{ margin: 0; color: var\(--enaex-red\)/, 'os rótulos de seção voltam em vermelho');
assert.match(stylesSource, /\.point-placement-toolbar \{[^}]*border-left: 3px solid var\(--enaex-red\)/, 'a barra de inserção de pontos precisa do filete vermelho à esquerda');
assert.match(stylesSource, /\.point-action-button \{[^}]*border-left: 3px solid var\(--enaex-red\)/, 'os botões de tipo de ponto precisam do filete vermelho à esquerda');
assert.match(stylesSource, /\.export-image-button \{[^}]*border-left: 3px solid var\(--enaex-red\)/, 'o botão Exportar croqui PNG precisa do filete vermelho à esquerda');
assert.match(stylesSource, /\.preview-zoom-toolbar \{[^}]*border-left: 3px solid var\(--ink\)/, 'a barra de zoom volta ao filete escuro de antes');
// Cantos retos (v1.20.28): só círculos (50%) e herança são aceitos; a miniatura sem geometria também não usa rx.
assert.doesNotMatch(stylesSource, /border-radius: (?!0;|50%|inherit)/, 'cantos retos: nenhum border-radius além de 0, de círculos (50%) e de herança');
assert.ok(!/\srx=/.test(stringThumbnailSvg({ entities: [] })), 'a miniatura sem geometria usa cantos retos');
assert.match(stylesSource, /\.topbar-meta \{ justify-self: end; gap: 10px; color: #c4c7cb; font: 500 9px\/1/, 'o status da faixa superior precisa de fonte menor');
assert.match(appHtml, /id="previewZoomReset"[^>]*title="Voltar ao enquadramento original"/, 'o botão Ajustar mantém a dica de uso');
// Pontos e estruturas (v1.20.29): a lista usa o desenho do croqui, a miniatura da estrutura reaproveita as strings e o popover é único.
const recordingContext = () => {
  const fills = [];
  const calls = [];
  const values = {};
  return new Proxy(values, {
    get: (target, key) => {
      if (key === 'fills') return fills;
      if (key === 'calls') return calls;
      if (key in target) return target[key];
      return (...args) => { calls.push(String(key)); return undefined; };
    },
    set: (target, key, value) => { if (key === 'fillStyle') fills.push(value); target[key] = value; return true; },
  });
};
const blockingRecorder = recordingContext();
drawPointIcon(blockingRecorder, 'blocking', { color: '#e4007c' }, 14, 14, 28, { blockingIcon: appConfig.report.blockingIcon });
assert.ok(blockingRecorder.fills.includes('#e4007c'), 'o cavalete precisa ser pintado com a cor do próprio ponto');
assert.throws(() => drawPointIcon(recordingContext(), 'blocking', {}, 14, 14, 28, { blockingIcon: appConfig.report.blockingIcon }), /sem cor/, 'um ponto de bloqueio sem cor não pode ser desenhado');
const cardRecorder = recordingContext();
drawPointIcon(cardRecorder, 'card', {}, 14, 14, 28, { image: null, colors: appConfig.report.colors });
assert.ok(cardRecorder.calls.includes('strokeRect'), 'sem imagem, o cartão usa o mesmo contorno de reserva do croqui');
assert.match(renderSource, /drawPointIcon\(ctx, kind, point, transform\.x\(point\), transform\.y\(point\), size, \{ image, colors \}\)/, 'os pontos de disparo e de cartões do croqui precisam usar a função compartilhada');
assert.match(renderSource, /drawPointIcon\(ctx, 'blocking', point, transform\.x\(point\), transform\.y\(point\), size, \{ blockingIcon: icon \}\)/, 'os pontos de bloqueio do croqui precisam usar a função compartilhada');
assert.match(appSource, /import \{[^}]*drawPointIcon[^}]*\} from '\.\/src\/render\.js\?v=1\.20\.36'/, 'o croqui e a lista precisam compartilhar o desenho do ponto, com o cache-busting atual');
assert.match(appSource, /function paintPointIcon\(element, kind, point\) \{[\s\S]*drawPointIcon\(ctx, kind, point, center, center/, 'a lista de pontos precisa desenhar o ícone real do croqui');
assert.doesNotMatch(appSource, /point-swatch/, 'o marcador genérico da lista de pontos foi substituído pelo ícone real');
assert.match(appSource, /function structureThumbColor\(structure\) \{[\s\S]{0,120}colors\.red : colors\.blue/, 'a miniatura da estrutura usa o vermelho de EVACUAR e o azul de LIBERADO do croqui');
assert.match(appSource, /stringThumbnailSvg\(\{ entities \}, \{ color \}\)/, 'a miniatura da estrutura reaproveita o desenho das strings');
assert.match(appSource, /row\.append\(thumb, copy, badge, actions\)/, 'a miniatura da estrutura fica à esquerda do nome, e as ações numa linha abaixo');
assert.match(appSource, /function updateStatusBadges\(\) \{ paintStructureThumbs\(\);/, 'a cor da miniatura acompanha a classificação calculada a cada redesenho');
assert.match(stylesSource, /\.structure-item > \.structure-thumb \{ grid-column: 1;/, 'a miniatura da estrutura ocupa a coluna da esquerda');
assert.match(stylesSource, /\.structure-actions \{ grid-column: 2 \/ span 2;/, 'select, Mover e × ficam numa linha própria, sob o nome');
const popoverSource = await fs.readFile(new URL('../src/point-popover.js', import.meta.url), 'utf8');
assert.doesNotMatch(popoverSource, /\b(?:window\.)?(?:confirm|alert)\(/, 'o popover não pode abrir janelas modais');
assert.match(popoverSource, /Confirmar exclusão/, 'excluir pede confirmação dentro do popover antes de apagar');
const popoverBox = { boxWidth: 600, boxHeight: 400, popoverWidth: 200, popoverHeight: 40, iconRadius: 10 };
assert.deepEqual(placePopover({ ...popoverBox, iconX: 100, iconY: 200 }), { left: 118, top: 180, side: 'right' }, 'o popover fica à direita do ícone, centralizado na vertical');
assert.equal(placePopover({ ...popoverBox, iconX: 580, iconY: 200 }).side, 'left', 'perto da borda direita o popover passa para a esquerda do ícone');
assert.equal(placePopover({ ...popoverBox, iconX: 580, iconY: 200 }).left, 362, 'do lado esquerdo, o popover fica à distância do ícone');
assert.equal(placePopover({ ...popoverBox, iconX: 100, iconY: 2 }).top, 4, 'o popover não sai pela borda superior da caixa');
assert.equal(placePopover({ ...popoverBox, iconX: 100, iconY: 399 }).top, 356, 'o popover não sai pela borda inferior da caixa');
assert.match(appSource, /function handleCanvasPointerDown\(event\) \{[\s\S]{0,160}event\.button !== 0/, 'só o botão esquerdo age sobre um ponto; o direito e o central seguem para a navegação da prévia');
assert.match(appSource, /Math\.hypot\(event\.clientX - gesture\.startX, event\.clientY - gesture\.startY\) < pointDragThreshold\(\)/, 'o arraste só começa depois do limiar em pixels da configuração');
assert.match(appSource, /function pointDragThreshold\(\) \{ return Number\(state\.config\?\.previewZoom\?\.dragThresholdPx\)/, 'o limiar de arraste vem de previewZoom.dragThresholdPx');
assert.match(appSource, /onViewChange: closePointPopover/, 'zoom e navegação precisam fechar o popover');
assert.match(appSource, /addEventListener\('scroll', closePointPopover\)/, 'a rolagem da prévia também fecha o popover');
assert.match(previewZoomSource, /onViewChange\?\.\(\)/, 'o zoom de visualização precisa avisar a mudança de visão');
assert.match(previewZoomSource, /pan\.moved = true; onViewChange\?\.\(\);/, 'a navegação precisa avisar ao começar a arrastar');
assert.match(appSource, /function commitPointMove\(\{ kind, point \}\) \{[\s\S]{0,200}refreshBlockingColor\(point\)/, 'soltar o arraste segue o fluxo do Mover e revalida a cor do bloqueio');
assert.match(appSource, /function cancelPointGesture\(\) \{/, 'Esc precisa poder cancelar um arraste em andamento');
assert.match(appSource, /function scheduleCanvasRender\(\) \{ if \(canvasRenderFrame\) return;/, 'o arraste redesenha no máximo uma vez por quadro');
// Furos OPIT (v1.20.30): validação da configuração, extração, deduplicação, contorno e integração com parseDxf.
// Os DXF são gerados como texto dentro do próprio teste; nenhum arquivo real do usuário entra no repositório.
{
  const holeBase = appConfig.holeStrings;
  const holeCfg = (overrides = {}) => validateHoleStringConfig({ ...holeBase, ...overrides });
  const SPACING = 4.17;
  const ROW_STEP = SPACING * Math.sqrt(3) / 2;
  const LEVEL = 279.854;
  const keyOf = (point) => `${point.x}|${point.y}`;
  const dxfText = (pairs) => [
    [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1015'], [0, 'ENDSEC'],
    [0, 'SECTION'], [2, 'ENTITIES'], ...pairs, [0, 'ENDSEC'], [0, 'EOF'],
  ].flatMap(([code, value]) => [String(code), String(value)]).join('\n') + '\n';
  const opitPoint = (x, y) => [[0, 'POINT'], [8, 'Hole'], [10, x], [20, y], [30, LEVEL]];
  const opitLine = (x, y) => [[0, 'LINE'], [8, 'Theoretical Hole'], [10, x], [20, y], [30, LEVEL], [11, x], [21, y], [31, 269.854]];
  const opitText = (x, y, number) => [[0, 'TEXT'], [8, 'Number'], [1, String(number)], [10, x], [20, y + 0.36], [30, LEVEL], [40, 0.3]];
  const opitCircle = (x, y) => [[0, 'CIRCLE'], [8, 'Hole'], [10, x], [20, y], [30, 0], [40, 0.3175]];
  const holePairs = (hole, number, style) => {
    if (style === 'circle') return opitCircle(hole.x, hole.y);
    if (style === 'point') return opitPoint(hole.x, hole.y);
    return [...opitPoint(hole.x, hole.y), ...opitLine(hole.x, hole.y), ...opitText(hole.x, hole.y, number)];
  };
  const holesPairs = (holes, style = 'opit') => holes.flatMap((hole, index) => holePairs(hole, index + 1, style));
  const holesDxf = (holes, style = 'opit') => dxfText(holesPairs(holes, style));
  // Malha triangular: linhas pares sem deslocamento, linhas ímpares deslocadas em meio espaçamento.
  const lattice = ({ cols = 12, rows = 9, originX = 0 } = {}) => {
    const holes = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) holes.push({ x: originX + col * SPACING + (row % 2) * SPACING / 2, y: row * ROW_STEP, row, col, cols, rows });
    }
    return holes;
  };
  const borderKeys = (holes) => new Set(holes.filter((h) => h.row === 0 || h.row === h.rows - 1 || h.col === 0 || h.col === h.cols - 1).map(keyOf));
  const sameXY = (a, b) => a.x === b.x && a.y === b.y;
  const ringOf = (points) => (points.length > 1 && sameXY(points[0], points.at(-1)) ? points.slice(0, -1) : points);
  const orient = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const within = (p, q, r) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const segmentsMeet = (a, b, c, d) => {
    const d1 = orient(c, d, a); const d2 = orient(c, d, b); const d3 = orient(a, b, c); const d4 = orient(a, b, d);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    return (d1 === 0 && within(c, d, a)) || (d2 === 0 && within(c, d, b)) || (d3 === 0 && within(a, b, c)) || (d4 === 0 && within(a, b, d));
  };
  const ringCrosses = (ring) => {
    const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 2; j < n; j += 1) {
        if (i === 0 && j === n - 1) continue;
        if (segmentsMeet(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
      }
    }
    return false;
  };
  const contourRing = (result, label) => {
    assert.notEqual(result.holes, null, `${label}: deveria gerar um contorno de furos`);
    const closed = result.entities.filter((entity) => entity.type === 'polyline' && entity.closed);
    assert.equal(closed.length, 1, `${label}: deve sair exatamente 1 polilinha fechada`);
    assert.equal(result.holes.contourVertices, closed[0].points.length, `${label}: contourVertices deve ser o comprimento do contorno`);
    const ring = ringOf(closed[0].points);
    assert.equal(ringCrosses(ring), false, `${label}: o contorno não pode ter cruzamento de arestas`);
    return ring;
  };
  const assertPerimeter = (ring, border, label) => {
    const ringKeys = new Set(ring.map(keyOf));
    assert.ok([...ringKeys].every((k) => border.has(k)), `${label}: o contorno passa por furo do interior ou por ponto que não é furo`);
    assert.ok([...border].every((k) => ringKeys.has(k)), `${label}: furo do perímetro externo fora do contorno`);
  };

  // Malha 12 x 9: perímetro = 12 + 12 + 7 + 7 = 38 furos.
  const main = lattice();
  const mainBorder = borderKeys(main);
  assert.equal(mainBorder.size, 38, 'o perímetro da malha 12 x 9 deve ter 38 furos');
  const mainResult = convertHoleEntities(parseDxf(holesDxf(main)), holeCfg());
  assert.equal(mainResult.entities.length, 1, 'a malha com POINT, LINE e TEXT deve virar exatamente uma entidade');
  assert.equal(mainResult.entities[0].type, 'polyline', 'a entidade de saída da malha precisa ser uma polyline');
  assert.equal(mainResult.entities[0].closed, true, 'o contorno da malha precisa ser fechado');
  assert.equal(mainResult.holes.count, main.length, 'POINT, LINE e TEXT do mesmo furo devem contar uma única vez');
  assert.equal(mainResult.holes.contours, 1, 'a malha deve gerar um único contorno');
  assertPerimeter(contourRing(mainResult, 'malha 12 x 9'), mainBorder, 'malha 12 x 9');
  const outline = holeOutline(main.map((h) => ({ x: h.x, y: h.y })), { alphaFactor: 1.2, isolatedAttachFactor: 1 });
  assert.equal(outline.contours.length, 1, 'holeOutline deve devolver um único polígono para a malha');
  assertPerimeter(ringOf(outline.contours[0]), mainBorder, 'holeOutline da malha 12 x 9');
  const circleResult = convertHoleEntities(parseDxf(holesDxf(main, 'circle')), holeCfg());
  assert.equal(circleResult.holes.count, main.length, 'furos em CIRCLE de raio 0,3175 devem ser contados um a um');
  assertPerimeter(contourRing(circleResult, 'círculos de raio 0,3175'), mainBorder, 'círculos de raio 0,3175');
  const crlfResult = convertHoleEntities(parseDxf(holesDxf(main).replace(/\n/g, '\r\n')), holeCfg());
  assertPerimeter(contourRing(crlfResult, 'DXF com CRLF'), mainBorder, 'DXF com quebras CRLF');
  const integrationText = holesDxf(main);
  assert.ok(integrationText.startsWith('0\nSECTION\n2\nHEADER\n') && integrationText.includes('0\nSECTION\n2\nENTITIES\n'), 'o DXF de teste precisa começar com HEADER e ter a seção ENTITIES');
  assert.ok(integrationText.endsWith('0\nENDSEC\n0\nEOF\n'), 'o DXF de teste precisa terminar com EOF');
  // Dois conjuntos separados por 42 m: dois contornos fechados, um por conjunto.
  const groupB = lattice({ originX: 90 });
  const twoResult = convertHoleEntities(parseDxf(holesDxf([...main, ...groupB])), holeCfg());
  assert.equal(twoResult.holes.contours, 2, 'dois conjuntos separados devem gerar dois contornos');
  const twoClosed = twoResult.entities.filter((entity) => entity.type === 'polyline' && entity.closed);
  assert.equal(twoClosed.length, 2, 'dois conjuntos separados devem sair como duas polilinhas fechadas');
  const groupARing = ringOf(twoClosed.find((entity) => ringOf(entity.points).every((p) => p.x < 60)).points);
  const groupBRing = ringOf(twoClosed.find((entity) => ringOf(entity.points).every((p) => p.x >= 60)).points);
  assertPerimeter(groupARing, mainBorder, 'conjunto A');
  assertPerimeter(groupBRing, borderKeys(groupB), 'conjunto B');
  assert.equal(ringCrosses(groupARing) || ringCrosses(groupBRing), false, 'nenhum dos contornos pode ter cruzamento');
  // Entalhe de 3 furos na borda inferior: o furo do fundo (linha 1, coluna 5) precisa estar no contorno.
  const notched = main.filter((h) => !(h.row === 0 && h.col >= 4 && h.col <= 6));
  const notchResult = convertHoleEntities(parseDxf(holesDxf(notched, 'point')), holeCfg());
  const notchKeys = new Set(contourRing(notchResult, 'entalhe').map(keyOf));
  assert.ok(notchKeys.has(keyOf(main.find((h) => h.row === 1 && h.col === 5))), 'o furo do fundo do entalhe deve estar no contorno');
  assert.ok(notched.filter((h) => h.row === 0).every((h) => notchKeys.has(keyOf(h))), 'os furos de borda ao lado do entalhe devem continuar no contorno');
  // Duplicatas: POINT, LINE e TEXT do mesmo furo viram um único furo; entidades que não são furos ficam em entities.
  const square = [[200, 200], [202, 200], [202, 202], [200, 202]];
  const squarePairs = [
    [0, 'POLYLINE'], [8, 'Area'], [66, 1], [70, 1], [10, 0], [20, 0], [30, 0],
    ...square.flatMap(([x, y]) => [[0, 'VERTEX'], [8, 'Area'], [10, x], [20, y], [30, 0]]),
    [0, 'SEQEND'], [8, 'Area'],
  ];
  const withSquare = convertHoleEntities(parseDxf(dxfText([...holesPairs(main), ...squarePairs])), holeCfg());
  assert.equal(withSquare.entities.length, 2, 'a poligonal que não é furo deve permanecer junto ao contorno');
  assert.ok(withSquare.entities.some((entity) => entity.type === 'polyline' && entity.points.some((p) => p.x === 200 && p.y === 200)), 'a poligonal de 4 vértices precisa continuar em entities');
  assert.equal(withSquare.holes.count, main.length, 'a poligonal de 4 vértices não pode virar furos');
  // Fileira colinear: não forma área fechada.
  const colinear = Array.from({ length: 12 }, (_, i) => ({ x: i * SPACING, y: 0 }));
  const colinearResult = convertHoleEntities(parseDxf(holesDxf(colinear, 'point')), holeCfg());
  assert.equal(colinearResult.holes, null, 'uma fileira colinear não pode gerar furos de área');
  assert.equal(colinearResult.entities.filter((entity) => entity.type === 'polyline' && entity.closed).length, 0, 'uma fileira colinear não pode gerar polilinha fechada');
  assert.ok(colinearResult.notices.some((notice) => /área fechada/.test(notice)), 'a fileira colinear precisa avisar que não forma área fechada');
  // Menos furos que o mínimo: os pontos continuam e o aviso diz o motivo.
  const pair = [{ x: 0, y: 0 }, { x: SPACING, y: 0 }];
  const minParsed = parseDxf(holesDxf(pair, 'point'));
  const minResult = convertHoleEntities(minParsed, holeCfg());
  assert.equal(minResult.holes, null, 'com 2 furos e mínimo 3 não deve haver contorno');
  assert.deepEqual(minResult.entities, minParsed.entities, 'com menos furos que o mínimo, os pontos devem continuar em entities');
  assert.equal(minResult.notices.length, 1, 'com menos furos que o mínimo, deve haver um único aviso');
  assert.match(minResult.notices[0], /mínimo/, 'o aviso de mínimo de furos precisa dizer "mínimo"');
  // Desligado: a entrada volta sem alteração.
  const disabledParsed = parseDxf(holesDxf(main));
  const disabledResult = convertHoleEntities(disabledParsed, holeCfg({ enabled: false }));
  assert.equal(disabledResult.holes, null, 'com a função desligada não pode haver furos');
  assert.equal(disabledResult.notices.length, 0, 'com a função desligada não pode haver avisos');
  assert.deepEqual(disabledResult.entities, disabledParsed.entities, 'com a função desligada as entidades devem ser as de entrada');
  // Limite de furos: 60 furos com limite 50 precisam ser recusados.
  const tooMany = Array.from({ length: 60 }, (_, i) => ({ x: (i % 10) * SPACING, y: Math.floor(i / 10) * ROW_STEP }));
  assert.throws(() => convertHoleEntities(parseDxf(holesDxf(tooMany, 'point')), holeCfg({ maxHoles: 50 })), /limite/, 'mais furos que maxHoles precisam lançar erro com "limite"');
  // Furos isolados: um a 3 m da borda é incorporado; um a 15 m é isolado e avisado.
  const nearStray = { x: -3, y: 2 * ROW_STEP };
  const attachedResult = convertHoleEntities(parseDxf(holesDxf([...main, nearStray], 'point')), holeCfg());
  assert.ok(attachedResult.holes.attached >= 1, 'um furo a menos de um espaçamento da borda deve ser incorporado');
  assert.equal(attachedResult.holes.isolated, 0, 'um furo incorporado não pode contar como isolado');
  const farStray = { x: -15, y: 4 * ROW_STEP };
  const isolatedResult = convertHoleEntities(parseDxf(holesDxf([...main, farStray], 'point')), holeCfg());
  assert.ok(isolatedResult.holes.isolated >= 1, 'um furo a mais de 3 espaçamentos da malha deve ser isolado');
  assert.ok(isolatedResult.notices.some((notice) => /isolado/.test(notice)), 'o furo isolado precisa gerar aviso com "isolado"');
  // Desempenho: malha de 2000 furos em menos de 4 s (somente a conversão é medida).
  const bigParsed = parseDxf(holesDxf(lattice({ cols: 50, rows: 40 }), 'point'));
  const bigStart = performance.now();
  const bigResult = convertHoleEntities(bigParsed, holeCfg());
  const bigElapsed = performance.now() - bigStart;
  assert.equal(bigResult.holes.count, 2000, 'a malha de 2000 furos deve ser contada por completo');
  assert.ok(bigElapsed < 4000, `a conversão de 2000 furos levou ${Math.round(bigElapsed)} ms (limite 4000 ms)`);
  // uniqueHoles e extractHoles.
  assert.equal(uniqueHoles([{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.001).length, 1, 'o mesmo ponto duas vezes conta como um furo');
  assert.equal(uniqueHoles([{ x: 0, y: 0 }, { x: 0.0004, y: 0 }], 0.001).length, 1, 'furos a 0,0004 m com tolerância 0,001 m são duplicatas');
  assert.equal(uniqueHoles([{ x: 0, y: 0 }, { x: 0.002, y: 0 }], 0.001).length, 2, 'furos a 0,002 m com tolerância 0,001 m são distintos');
  const cfgExtract = holeCfg();
  const pointOnly = extractHoles([{ type: 'point', points: [{ x: 1, y: 2 }], layer: 'Hole' }], cfgExtract);
  assert.equal(pointOnly.holes.length, 1, 'um POINT vira furo');
  assert.equal(pointOnly.rest.length, 0, 'um POINT não pode ir para rest');
  const boundaryCircle = extractHoles([{ type: 'circle', points: [{ x: 1, y: 2 }], radius: cfgExtract.maxCircleRadius, layer: 'Hole' }], cfgExtract);
  assert.equal(boundaryCircle.holes.length, 1, 'um círculo com raio igual ao máximo deve virar furo');
  const bigCircle = extractHoles([{ type: 'circle', points: [{ x: 1, y: 2 }], radius: 5, layer: 'Hole' }], cfgExtract);
  assert.equal(bigCircle.holes.length, 0, 'um círculo de raio 5 não pode ser furo');
  assert.equal(bigCircle.rest.length, 1, 'um círculo de raio 5 deve ir para rest');
  const zeroLine = extractHoles([{ type: 'line', points: [{ x: 1, y: 2 }, { x: 1, y: 2 }], closed: false, layer: 'Theoretical Hole' }], cfgExtract);
  assert.equal(zeroLine.holes.length, 1, 'uma LINE de comprimento zero em planta deve virar furo');
  const realLine = extractHoles([{ type: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, layer: 'Cut' }], cfgExtract);
  assert.equal(realLine.holes.length, 0, 'uma LINE com comprimento real não pode ser furo');
  assert.equal(realLine.rest.length, 1, 'uma LINE com comprimento real deve ir para rest');
  const mixedParsed = parseDxf(dxfText([
    ...opitPoint(1, 1),
    ...opitCircle(2, 2),
    [0, 'CIRCLE'], [8, 'Cut'], [10, 3], [20, 3], [30, 0], [40, 5],
    ...opitLine(4, 4),
    [0, 'LINE'], [8, 'Cut'], [10, 10], [20, 10], [30, 0], [11, 20], [21, 10], [31, 0],
  ]));
  const mixed = extractHoles(mixedParsed.entities, cfgExtract);
  assert.deepEqual(mixed.holes.map(keyOf).sort(), ['1|1', '2|2', '4|4'], 'DXF lido: POINT, CIRCLE pequeno e LINE sem comprimento são os furos');
  assert.deepEqual(mixed.rest.map((entity) => entity.type).sort(), ['circle', 'line'], 'DXF lido: CIRCLE grande e LINE real ficam em rest');
  // Validação da configuração: valores inválidos precisam lançar erro.
  assert.doesNotThrow(() => validateHoleStringConfig(holeBase), 'a configuração atual de holeStrings precisa ser válida');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, alphaFactor: 0.5 }), Error, 'alphaFactor abaixo do mínimo precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, alphaFactor: 11 }), Error, 'alphaFactor acima do máximo precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, minHoles: 2 }), Error, 'minHoles 2 precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, minHoles: 5, maxHoles: 4 }), Error, 'maxHoles menor que minHoles precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, maxHoles: 25000 }), Error, 'maxHoles 25000 precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, isolatedAttachFactor: -1 }), Error, 'isolatedAttachFactor negativo precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, enabled: 'sim' }), Error, 'enabled como texto precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, maxCircleRadius: 0 }), Error, 'maxCircleRadius zero precisa ser recusado');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, duplicateToleranceM: -0.1 }), Error, 'duplicateToleranceM negativa precisa ser recusada');
  assert.throws(() => validateHoleStringConfig({ ...holeBase, zeroLengthToleranceM: NaN }), Error, 'zeroLengthToleranceM NaN precisa ser recusada');
  assert.throws(() => validateHoleStringConfig(undefined), Error, 'sem configuração de holeStrings a validação precisa falhar');
  // Integração do app: import, chamada em handleStrings, campo de entrada no index.html e flag no config.json.
  assert.ok(appSource.includes("import { convertHoleEntities, validateHoleStringConfig } from './src/holes.js?v=1.20.30';"), 'o app.js precisa importar o módulo de furos com o cache-busting 1.20.30');
  const handleStart = appSource.search(/(?:async\s+)?function\s+handleStrings\b/);
  assert.ok(handleStart >= 0, 'a função handleStrings precisa existir no app.js');
  const handleRest = appSource.slice(handleStart + 1);
  const handleEnd = handleRest.search(/\n(?:async\s+)?function\s/);
  const handleBody = appSource.slice(handleStart, handleEnd >= 0 ? handleStart + 1 + handleEnd : undefined);
  assert.match(handleBody, /convertHoleEntities\(/, 'handleStrings precisa chamar convertHoleEntities');
  const stringInputAt = appHtml.indexOf('id="stringFile"');
  assert.ok(stringInputAt >= 0, 'o campo de strings precisa existir no index.html');
  const stringLabelOpen = appHtml.slice(appHtml.lastIndexOf('<label', stringInputAt), appHtml.indexOf('>', appHtml.lastIndexOf('<label', stringInputAt)) + 1);
  assert.match(stringLabelOpen, /title="[^"]*OPIT[^"]*"/, 'o título do campo de strings precisa mencionar OPIT');
  const visibleText = appHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
  assert.match(visibleText, /furos do OPIT/, 'o texto visível do campo de strings precisa mencionar os furos do OPIT');
  assert.equal(appConfig.holeStrings.enabled, true, 'holeStrings.enabled precisa estar true no config.json');
}

// Seta do ponto de entrega de cartões (v1.20.33): aponta para o canto superior esquerdo do ícone, com recuo configurado.
{
  const arrowConfig = appConfig.report.cardArrow;
  const calls = [];
  const fakeCtx = { save() {}, restore() {}, beginPath() {}, closePath() {}, stroke() { calls.push('stroke'); }, fill() { calls.push('fill'); }, fillStyle: null, strokeStyle: null, lineWidth: 0, lineJoin: '', moveTo(x, y) { calls.push([x, y]); }, lineTo(x, y) { calls.push([x, y]); } };
  const colors = { red: '#ed1c24' };
  drawCardArrow(fakeCtx, { x: 100, y: 100 }, { x: (p) => p.x, y: (p) => p.y }, { card: 30 }, arrowConfig, colors);
  const points = calls.filter((call) => Array.isArray(call));
  const tip = points[3];
  const corner = { x: 85, y: 85 };
  const recuo = 30 * arrowConfig.gapFactor / Math.SQRT2;
  assert.ok(Math.abs(tip[0] - (corner.x - recuo)) < 1e-6 && Math.abs(tip[1] - (corner.y - recuo)) < 1e-6, 'a ponta da seta precisa ficar um recuo antes do canto superior esquerdo do ícone');
  assert.ok(Math.min(...points.map((p) => p[0])) < tip[0] - 10 && Math.min(...points.map((p) => p[1])) < tip[1] - 10, 'a cauda da seta precisa ficar acima e à esquerda da ponta');
  assert.ok(calls.includes('fill') && calls.includes('stroke'), 'a seta precisa ter preenchimento e halo');
  assert.equal(fakeCtx.fillStyle, colors.red, 'a seta precisa usar a cor vermelha de produção do croqui');
  assert.throws(() => drawCardArrow(fakeCtx, { x: 1, y: 1 }, { x: (p) => p.x, y: (p) => p.y }, { card: 30 }, { ...arrowConfig, haloWidth: undefined }, colors), /haloWidth/, 'configuração ausente da seta precisa falhar, sem valores improvisados');
  assert.match(renderSource, /drawCardArrow\(ctx, point, transform, model\.pointIconSizes, config\.report\.cardArrow, colors\)/, 'a seta precisa ser desenhada em cada ponto de entrega de cartões');
}

// Proibido Trafegar (v1.20.34): tipo de ponto com a mesma inserção do bloqueio, ícone vetorial próprio e legenda numerada.
{
  const icon = appConfig.report.prohibitedIcon;
  assert.match(icon.ringColor, /^#[0-9a-f]{6}$/i, 'o anel do sinal de proibido precisa de cor hexadecimal');
  assert.match(appConfig.report.legend.prohibitedPointLabel, /\{number\}/, 'o rótulo numerado do proibido precisa do marcador {number}');
  assert.equal(appConfig.report.legend.prohibitedPointDefaultLabel, 'PROIBIDO TRAFEGAR', 'a legenda sem pontos proibidos precisa do rótulo padrão');
  const calls = [];
  const stub = { fillStyle: null, strokeStyle: null, lineWidth: 0, lineCap: '', save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() { calls.push('arc'); }, clip() { calls.push('clip'); }, fill() { calls.push(`fill:${this.fillStyle}`); }, stroke() { calls.push(`stroke:${this.strokeStyle}`); } };
  drawProhibitedIcon(stub, 100, 100, 40, icon);
  assert.equal(calls[0], 'arc', 'o sinal começa pelo anel');
  assert.equal(calls[1], `fill:${icon.ringColor}`, 'o anel precisa usar a cor configurada');
  assert.ok(calls.includes(`fill:${icon.truckColor}`), 'o caminhão precisa usar a cor configurada');
  assert.ok(calls.indexOf('clip') > -1 && calls.indexOf('clip') < calls.indexOf(`stroke:${icon.slashColor}`), 'a barra diagonal precisa ser recortada pelo círculo, depois do caminhão');
  assert.throws(() => drawProhibitedIcon(stub, 1, 1, 10, { ...icon, truckScale: undefined }), /truckScale/, 'configuração ausente do ícone precisa falhar, sem valores improvisados');
  assert.ok(appSource.includes("['firing', 'blocking', 'prohibited', 'card']"), 'todas as listas de tipos de ponto precisam aceitar o Proibido Trafegar');
  assert.match(appHtml, /id="addProhibitedPointButton" data-point-type="prohibited"/, 'a barra de pontos precisa ter o botão Proibido trafegar');
  assert.match(appSource, /\$\('addProhibitedPointButton'\)\.addEventListener\('click', \(\) => togglePointPlacement\('prohibited'\)\)/, 'o botão precisa ativar a inserção do tipo prohibited');
  assert.match(appSource, /prohibitedPoints: state\.prohibitedPoints/, 'o projeto salvo precisa incluir os pontos proibidos');
  assert.match(renderSource, /rows\.push\(\{ icon: 'prohibited'/, 'a legenda precisa listar os pontos proibidos');
  assert.match(renderSource, /drawProhibitedMarker\(ctx, point, transform, config\.report\.prohibitedIcon, model\.pointIconSizes\)/, 'os pontos proibidos precisam ser desenhados no croqui com o tamanho do bloqueio');
  assert.match(appSource, /paintProhibitedButtonIcon\(\);/, 'o botão Proibido trafegar precisa mostrar o mesmo sinal do croqui');
  assert.match(stylesSource, /\.point-actions \{ display: flex; flex: 1 1 560px; flex-wrap: wrap;/, 'a barra de tipos de ponto precisa quebrar linha em vez de sobrepor os botões');
  assert.ok(appConfig.report.prohibitedIcon.slashHaloWidth > 0, 'a barra diagonal precisa de contorno claro configurado');
}

console.log(`PASS: DXF ${parsed.entities.length} entidades, ${getStringEndpoints(parsed.entities).length} extremidades, GeoJSON e nome de arquivo validados.`);
