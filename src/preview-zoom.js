// Zoom de visualização da prévia do croqui.
// Altera somente o tamanho CSS do canvas e a rolagem da moldura da prévia. O bitmap do canvas,
// o modelo, as coordenadas dos pontos e a exportação em PNG/PDF não dependem do zoom.

export function validatePreviewZoomConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('previewZoom precisa estar configurado no config.json.');
  const number = (key) => {
    if (!Number.isFinite(config[key])) throw new Error(`previewZoom.${key} precisa ser um número.`);
    return config[key];
  };
  const minZoom = number('minZoom');
  const maxZoom = number('maxZoom');
  if (minZoom < 1) throw new Error('previewZoom.minZoom não pode ser menor que 1: 100% é o enquadramento ajustado à largura.');
  if (maxZoom <= minZoom) throw new Error('previewZoom.maxZoom precisa ser maior que previewZoom.minZoom.');
  if (number('buttonStep') <= 1) throw new Error('previewZoom.buttonStep precisa ser maior que 1.');
  if (number('wheelSensitivity') <= 0) throw new Error('previewZoom.wheelSensitivity precisa ser maior que zero.');
  if (number('dragThresholdPx') < 0) throw new Error('previewZoom.dragThresholdPx não pode ser negativo.');
  return config;
}

export function clampZoom(zoom, config) {
  return Math.min(config.maxZoom, Math.max(config.minZoom, zoom));
}

// Fator multiplicativo de um evento de roda (deltaMode: 0 pixels, 1 linhas, 2 páginas).
export function wheelZoomFactor(event, viewportHeight, config) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1;
  return Math.exp(-event.deltaY * unit * config.wheelSensitivity);
}

export function setupPreviewZoom({ stage, canvas, zoomInButton, zoomOutButton, resetButton, levelOutput, config, onViewChange = null }) {
  validatePreviewZoomConfig(config);
  let zoom = config.minZoom;
  let pan = null;
  let suppressClick = false;
  // A redução de movimento do CSS dá ao canvas uma transição quase instantânea na largura. Sem desligá-la, a medida
  // logo após mudar o zoom ainda mostra a largura anterior e a âncora do cursor sai do lugar.
  canvas.style.setProperty('transition', 'none', 'important');

  const isScrollable = () => stage.scrollWidth > stage.clientWidth || stage.scrollHeight > stage.clientHeight;

  function updateControls() {
    levelOutput.textContent = `${Math.round(zoom * 100)}%`;
    zoomInButton.disabled = zoom >= config.maxZoom;
    zoomOutButton.disabled = zoom <= config.minZoom;
    resetButton.disabled = zoom <= config.minZoom;
  }

  // Muda o zoom mantendo fixo o ponto sob o cursor; os botões usam o centro da moldura.
  function setZoom(next, anchor) {
    const target = clampZoom(next, config);
    if (target === zoom) return;
    const frame = stage.getBoundingClientRect();
    const x = anchor ? anchor.x : frame.left + frame.width / 2;
    const y = anchor ? anchor.y : frame.top + frame.height / 2;
    const before = canvas.getBoundingClientRect();
    const fractionX = before.width ? (x - before.left) / before.width : 0.5;
    const fractionY = before.height ? (y - before.top) / before.height : 0.5;
    zoom = target;
    canvas.style.width = `${zoom * 100}%`;
    stage.classList.toggle('is-zoomed', zoom > config.minZoom);
    const after = canvas.getBoundingClientRect();
    stage.scrollLeft += after.left + fractionX * after.width - x;
    stage.scrollTop += after.top + fractionY * after.height - y;
    updateControls();
    onViewChange?.();
  }

  // Em 100% com rolagem para baixo a roda não é capturada e a página continua rolando; nos demais casos a roda controla o zoom.
  stage.addEventListener('wheel', (event) => {
    if (!event.deltaY) return;
    const factor = wheelZoomFactor(event, stage.clientHeight, config);
    if (zoom <= config.minZoom && factor < 1) return;
    event.preventDefault();
    setZoom(zoom * factor, { x: event.clientX, y: event.clientY });
  }, { passive: false });

  zoomInButton.addEventListener('click', () => setZoom(zoom * config.buttonStep));
  zoomOutButton.addEventListener('click', () => setZoom(zoom / config.buttonStep));
  resetButton.addEventListener('click', () => { setZoom(config.minZoom); stage.scrollTo(0, 0); onViewChange?.(); });

  // Arrastar navega quando a prévia tem rolagem, com botão esquerdo (e toque), central ou direito. Um gesto de ponto
  // (já tratado pelo canvas) não entra aqui. Botões central e direito não passam pelo clique de inserção do croqui,
  // então capturam o ponteiro; o esquerdo segue sem captura para não alterar o clique do canvas.
  stage.addEventListener('pointerdown', (event) => {
    suppressClick = false;
    if (event.defaultPrevented || ![0, 1, 2].includes(event.button) || !isScrollable()) return;
    if (event.button !== 0) stage.setPointerCapture(event.pointerId);
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
  });
  window.addEventListener('pointermove', (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < config.dragThresholdPx) return;
      pan.moved = true; onViewChange?.();
      stage.classList.add('is-panning');
    }
    stage.scrollLeft = pan.left - dx;
    stage.scrollTop = pan.top - dy;
  });
  const endPan = (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    suppressClick = pan.moved;
    pan = null;
    stage.classList.remove('is-panning');
  };
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);
  // Um arraste de navegação não pode terminar como clique de inserção de ponto.
  stage.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
  // Botão direito não abre o menu de contexto sobre a prévia; botão central não inicia a rolagem automática do navegador.
  stage.addEventListener('contextmenu', (event) => event.preventDefault());
  stage.addEventListener('mousedown', (event) => { if (event.button === 1) event.preventDefault(); });
  stage.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });

  updateControls();
}
