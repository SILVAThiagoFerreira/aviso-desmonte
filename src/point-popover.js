// Popover de ações de um ponto operacional no croqui: Mover e Excluir. Fica ao lado do ícone, dentro da
// moldura da prévia, para acompanhar o zoom e a rolagem. Fecha com clique fora, Esc, ou quando o chamador
// fecha (zoom e navegação). Excluir pede confirmação dentro do próprio popover: nada de janelas modais.

const GAP_PX = 8;
const MARGIN_PX = 4;

// Posição do popover em px CSS, dentro da caixa do croqui. Prefere o lado direito do ícone; usa o esquerdo
// quando o direito não cabe; e mantém o popover inteiro dentro da caixa.
export function placePopover({ iconX, iconY, iconRadius, boxWidth, boxHeight, popoverWidth, popoverHeight, gap = GAP_PX, margin = MARGIN_PX }) {
  const rightLeft = iconX + iconRadius + gap;
  const leftLeft = iconX - iconRadius - gap - popoverWidth;
  const rightFits = rightLeft + popoverWidth <= boxWidth - margin;
  const leftFits = leftLeft >= margin;
  const side = rightFits || !leftFits ? 'right' : 'left';
  const preferred = side === 'right' ? rightLeft : leftLeft;
  const left = Math.max(margin, Math.min(preferred, boxWidth - popoverWidth - margin));
  const top = Math.max(margin, Math.min(iconY - popoverHeight / 2, boxHeight - popoverHeight - margin));
  return { left, top, side };
}

export function createPointPopover({ host, onMove, onDelete }) {
  const element = document.createElement('div');
  element.className = 'map-point-popover';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', 'Ações do ponto no croqui');
  const title = document.createElement('strong');
  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'map-point-popover-move';
  moveButton.textContent = 'Mover';
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'map-point-popover-delete';
  deleteButton.textContent = 'Excluir';
  element.append(title, moveButton, deleteButton);
  host.append(element);

  let current = null;
  let confirming = false;
  const setConfirming = (value) => {
    confirming = value;
    deleteButton.textContent = value ? 'Confirmar exclusão' : 'Excluir';
    deleteButton.classList.toggle('is-confirming', value);
  };

  function close() {
    if (!current) return;
    current = null;
    element.hidden = true;
    setConfirming(false);
  }

  // Posiciona em coordenadas da caixa do croqui (x, y, radius, boxWidth, boxHeight) e soma o deslocamento
  // dessa caixa dentro da moldura da prévia (offsetX, offsetY).
  function open({ target, label, x, y, radius, boxWidth, boxHeight, offsetX, offsetY }) {
    current = target;
    setConfirming(false);
    title.textContent = label;
    element.hidden = false;
    const placement = placePopover({ iconX: x, iconY: y, iconRadius: radius, boxWidth, boxHeight, popoverWidth: element.offsetWidth, popoverHeight: element.offsetHeight });
    element.style.left = `${offsetX + placement.left}px`;
    element.style.top = `${offsetY + placement.top}px`;
    element.dataset.side = placement.side;
  }

  moveButton.addEventListener('click', () => {
    const target = current;
    close();
    if (target) onMove(target);
  });
  deleteButton.addEventListener('click', () => {
    if (!current) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const target = current;
    close();
    onDelete(target);
  });

  // Toques no popover não chegam à prévia: sem arraste de navegação nem clique de inserção por baixo.
  element.addEventListener('pointerdown', (event) => event.stopPropagation());
  element.addEventListener('mousedown', (event) => event.stopPropagation());
  document.addEventListener('pointerdown', (event) => { if (current && !element.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  return {
    element,
    open,
    close,
    isOpen: () => Boolean(current),
    getTarget: () => current,
  };
}
