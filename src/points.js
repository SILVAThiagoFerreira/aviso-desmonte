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
