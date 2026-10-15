// Regras dos pontos de bloqueio: paleta, cor aleatória e rótulos da legenda.
// Sem acesso ao DOM, para que possam ser testadas no Node.

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const NUMBER_TOKEN = '{number}';

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function validateBlockingPointConfig(report) {
  const palette = report?.blockingPointColors;
  if (!Array.isArray(palette) || !palette.length) throw new Error('A configuração precisa informar report.blockingPointColors com pelo menos uma cor.');
  const seen = new Set();
  palette.forEach((color) => {
    if (!isHexColor(color)) throw new Error(`Cor inválida em report.blockingPointColors: ${color}`);
    const key = color.toLowerCase();
    if (seen.has(key)) throw new Error(`Cor repetida em report.blockingPointColors: ${color}`);
    seen.add(key);
  });
  const template = report?.legend?.blockingPointLabel;
  if (typeof template !== 'string' || !template.includes(NUMBER_TOKEN)) throw new Error(`report.legend.blockingPointLabel precisa conter ${NUMBER_TOKEN}.`);
  validateBlockingIconConfig(report.blockingIcon);
  validateBlockingContrastConfig(report.blockingPointContrast);
}

// Contraste exigido entre a cor do ponto e o fundo que ele cobre: ΔE mínimo em
// CIELAB, parcela das amostras que precisa atingi-lo e tamanho da área amostrada
// (fração do ícone).
function validateBlockingContrastConfig(contrast) {
  if (!contrast || typeof contrast !== 'object') throw new Error('report.blockingPointContrast precisa estar configurado.');
  assertPositive(contrast.minimumDeltaE, 'report.blockingPointContrast.minimumDeltaE');
  if (contrast.minimumDeltaE > 100) throw new Error('report.blockingPointContrast.minimumDeltaE não pode passar de 100.');
  assertPositive(contrast.requiredShare, 'report.blockingPointContrast.requiredShare');
  if (contrast.requiredShare > 1) throw new Error('report.blockingPointContrast.requiredShare não pode passar de 1.');
  assertPositive(contrast.footprintRatio, 'report.blockingPointContrast.footprintRatio');
  if (contrast.footprintRatio > 1) throw new Error('report.blockingPointContrast.footprintRatio não pode passar de 1.');
  assertPositive(contrast.sampleStep, 'report.blockingPointContrast.sampleStep');
  if (!Number.isInteger(contrast.sampleStep)) throw new Error('report.blockingPointContrast.sampleStep precisa ser um número inteiro de pixels.');
}

function assertNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} precisa ser um número.`);
}

function assertPositive(value, label) {
  assertNumber(value, label);
  if (value <= 0) throw new Error(`${label} precisa ser maior que zero.`);
}

// Geometria do cavalete em um quadro de viewBox × viewBox. O desenho só usa
// valores que passaram por esta validação: a faixa mínima das listras impede
// um laço infinito, e tábuas, suportes e pernas precisam caber no quadro.
export function validateBlockingIconConfig(icon) {
  if (!icon || typeof icon !== 'object') throw new Error('report.blockingIcon precisa estar configurado.');
  assertPositive(icon.viewBox, 'report.blockingIcon.viewBox');
  if (!isHexColor(icon.stripes?.color)) throw new Error('report.blockingIcon.stripes.color precisa ser uma cor #rrggbb.');
  assertPositive(icon.stripes.period, 'report.blockingIcon.stripes.period');
  if (icon.stripes.period < 1) throw new Error('report.blockingIcon.stripes.period precisa ser de pelo menos 1 unidade do quadro.');
  assertPositive(icon.stripes.width, 'report.blockingIcon.stripes.width');
  assertNumber(icon.stripes.slope, 'report.blockingIcon.stripes.slope');
  if (icon.outline) {
    if (!isHexColor(icon.outline.color)) throw new Error('report.blockingIcon.outline.color precisa ser uma cor #rrggbb.');
    assertNumber(icon.outline.width, 'report.blockingIcon.outline.width');
    if (icon.outline.width < 0) throw new Error('report.blockingIcon.outline.width não pode ser negativo.');
  }
  if (icon.halo) {
    if (!isHexColor(icon.halo.color)) throw new Error('report.blockingIcon.halo.color precisa ser uma cor #rrggbb.');
    assertNumber(icon.halo.width, 'report.blockingIcon.halo.width');
    if (icon.halo.width < 0) throw new Error('report.blockingIcon.halo.width não pode ser negativo.');
  }
  ['posts', 'boards', 'legs'].forEach((key) => {
    if (!Array.isArray(icon[key])) throw new Error(`report.blockingIcon.${key} precisa ser uma lista.`);
    icon[key].forEach((item, index) => {
      if (!item || typeof item !== 'object') throw new Error(`report.blockingIcon.${key}[${index}] precisa ser um objeto.`);
    });
  });
  if (!icon.boards.length) throw new Error('report.blockingIcon.boards precisa conter pelo menos uma tábua.');
  const inFrame = (value) => value >= 0 && value <= icon.viewBox;
  const checkRectangles = (list, key) => list.forEach((item, index) => {
    const label = `report.blockingIcon.${key}[${index}]`;
    ['x', 'y'].forEach((field) => assertNumber(item[field], `${label}.${field}`));
    ['width', 'height'].forEach((field) => assertPositive(item[field], `${label}.${field}`));
    if (![item.x, item.x + item.width, item.y, item.y + item.height].every(inFrame)) throw new Error(`${label} precisa caber no quadro de ${icon.viewBox} unidades.`);
  });
  checkRectangles(icon.posts, 'posts');
  checkRectangles(icon.boards, 'boards');
  icon.legs.forEach((leg, index) => {
    const label = `report.blockingIcon.legs[${index}]`;
    ['x1', 'y1', 'x2', 'y2'].forEach((field) => assertNumber(leg[field], `${label}.${field}`));
    assertPositive(leg.width, `${label}.width`);
    if (![leg.x1, leg.x2, leg.y1, leg.y2].every(inFrame)) throw new Error(`${label} precisa caber no quadro de ${icon.viewBox} unidades.`);
  });
}

// Sorteia uma cor da paleta, preferindo cores que ainda não estão em uso.
// Quando a paleta se esgota, todas as cores voltam a concorrer.
export function pickBlockingPointColor(palette, usedColors = [], random = Math.random) {
  if (!palette?.length) throw new Error('A paleta de pontos de bloqueio está vazia.');
  const used = new Set(usedColors.map((color) => String(color).toLowerCase()));
  const unused = palette.filter((color) => !used.has(color.toLowerCase()));
  const pool = unused.length ? unused : palette;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function blockingPointLegendLabel(template, number) {
  return template.replace(NUMBER_TOKEN, String(number));
}

function hasColor(point) {
  return point.color !== undefined && point.color !== null && point.color !== '';
}

// Valida todas as cores antes de alterar qualquer ponto. Pontos sem cor, como
// os de projetos anteriores à paleta, recebem uma cor sorteada; a quantidade
// retornada permite avisar o usuário. Cores com formato inválido geram erro.
export function assignMissingBlockingPointColors(points, palette, random = Math.random) {
  points.forEach((point, index) => {
    if (!point || typeof point !== 'object') throw new Error(`Ponto de bloqueio ${index + 1} é inválido.`);
    if (hasColor(point) && !isHexColor(point.color)) throw new Error(`Ponto de bloqueio ${index + 1} tem cor inválida: ${point.color}`);
  });
  const usedColors = points.filter(hasColor).map((point) => point.color);
  let assigned = 0;
  points.filter((point) => !hasColor(point)).forEach((point) => {
    point.color = pickBlockingPointColor(palette, usedColors, random);
    usedColors.push(point.color);
    assigned += 1;
  });
  return assigned;
}

// Contraste com o fundo: a cor do ponto precisa se distinguir do croqui ao redor,
// medido em CIELAB (ΔE CIE76) sobre amostras de pixels em volta do ponto.
export function hexToRgb(hex) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

export function rgbToLab([r, g, b]) {
  const linear = (channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  const R = linear(r); const G = linear(g); const B = linear(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function labDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Parcela das amostras de fundo em que a cor se distingue (ΔE >= minimumDeltaE).
export function contrastShare(color, backgroundLabs, minimumDeltaE) {
  if (!backgroundLabs.length) return 0;
  const lab = rgbToLab(hexToRgb(color));
  return backgroundLabs.filter((background) => labDistance(lab, background) >= minimumDeltaE).length / backgroundLabs.length;
}

export function hasAdequateContrast(color, backgroundLabs, contrast) {
  return contrastShare(color, backgroundLabs, contrast.minimumDeltaE) >= contrast.requiredShare;
}

// Sorteia a cor entre as que se destacam do fundo (parcela >= requiredShare),
// preferindo cores ainda não usadas. Se nenhuma se destaca, usa a de maior
// parcela e devolve adequate: false, para que o usuário seja avisado.
export function chooseBlockingPointColor({ palette, usedColors = [], backgroundLabs, contrast, random = Math.random }) {
  if (!palette?.length) throw new Error('A paleta de pontos de bloqueio está vazia.');
  const used = new Set(usedColors.map((color) => String(color).toLowerCase()));
  const scored = palette.map((color) => ({ color, share: contrastShare(color, backgroundLabs, contrast.minimumDeltaE), unused: !used.has(color.toLowerCase()) }));
  const adequate = scored.filter((item) => item.share >= contrast.requiredShare);
  const bestShare = Math.max(...scored.map((item) => item.share));
  const candidates = adequate.length ? adequate : scored.filter((item) => item.share === bestShare);
  const pool = candidates.some((item) => item.unused) ? candidates.filter((item) => item.unused) : candidates;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return { color: chosen.color, share: chosen.share, adequate: adequate.length > 0 };
}

// Decide a cor de um ponto já posicionado. Mantém a cor atual enquanto ela se
// destaca do fundo, a menos que outro ponto a use e exista cor livre adequada.
// Sem amostras do fundo não há como julgar: a cor atual é mantida.
export function settleBlockingPointColor({ palette, currentColor, otherColors = [], backgroundLabs, contrast, random = Math.random }) {
  if (!backgroundLabs.length) {
    if (currentColor) return { color: currentColor, adequate: false, measured: false, changed: false };
    return { color: pickBlockingPointColor(palette, otherColors, random), adequate: false, measured: false, changed: true };
  }
  const others = otherColors.map((color) => color.toLowerCase());
  const duplicated = Boolean(currentColor) && others.includes(currentColor.toLowerCase());
  const adequateNow = Boolean(currentColor) && hasAdequateContrast(currentColor, backgroundLabs, contrast);
  const choice = chooseBlockingPointColor({ palette, usedColors: otherColors, backgroundLabs, contrast, random });
  if (adequateNow && !duplicated) return { color: currentColor, adequate: true, measured: true, changed: false };
  if (adequateNow && (!choice.adequate || others.includes(choice.color.toLowerCase()))) return { color: currentColor, adequate: true, measured: true, changed: false };
  return { color: choice.color, adequate: choice.adequate, measured: true, changed: choice.color !== currentColor };
}
