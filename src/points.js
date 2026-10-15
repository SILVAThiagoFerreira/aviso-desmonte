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
