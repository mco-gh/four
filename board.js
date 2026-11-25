// Draws a Four board: discs fall behind a frame with holes in it. Each
// column is a button, so a mouse, a finger or the keyboard can drop a disc.
import { COLS, ROWS, at, canDrop } from './rules.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');

export class Board {
  /**
   * el: the element to draw into.
   * onDrop(col): called when the player picks a column (omit for a board that only shows).
   */
  constructor(el, { onDrop } = {}) {
    this.el = el;
    this.onDrop = onDrop;
    this.seat = 0;             // which player is "me" (drawn in my color)
    this.game = null;
    this.active = false;       // whether my discs can be dropped now
    this.focusCol = 3;
    this.hoverCol = null;
    this.discs = new Map();    // cell → element

    el.classList.add('board');
    el.innerHTML = '<div class="discs"></div><div class="frame"><div class="holes"></div></div><div class="cols" role="group"></div>';
    this.discLayer = el.querySelector('.discs');
    this.colLayer = el.querySelector('.cols');

    this.ghost = document.createElement('i');
    this.ghost.className = 'disc ghost me';
    this.ghost.hidden = true;
    this.discLayer.append(this.ghost);

    if (!onDrop) {
      this.colLayer.remove();
      return;
    }
    this.colLayer.setAttribute('aria-label', 'Columns');
    this.buttons = Array.from({ length: COLS }, (_, col) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'col';
      button.style.setProperty('--c', col);
      button.tabIndex = col === this.focusCol ? 0 : -1;
      button.addEventListener('click', () => this.pick(col));
      button.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.hover(col); });
      button.addEventListener('pointerleave', () => { if (this.hoverCol === col) this.hover(null); });
      button.addEventListener('focus', () => { this.focusCol = col; this.roving(); this.hover(col); });
      button.addEventListener('blur', () => { if (this.hoverCol === col) this.hover(null); });
      this.colLayer.append(button);
      return button;
    });
    this.colLayer.addEventListener('keydown', (event) => this.key(event));
  }

  setSeat(seat) {
    this.seat = seat;
    for (const [cell, disc] of this.discs) this.paint(disc, this.game?.cells[cell]);
  }

  /** Match the discs to the game. `drop` is the cell of a disc to animate falling in. */
  sync(game, { drop = null } = {}) {
    this.game = game;
    for (const [cell, disc] of this.discs) {
      if (game.cells[cell] === null) {
        disc.remove();
        this.discs.delete(cell);
      }
    }
    game.cells.forEach((owner, cell) => {
      if (owner === null) return;
      let disc = this.discs.get(cell);
      if (!disc) {
        disc = document.createElement('i');
        disc.style.setProperty('--c', cell % COLS);
        disc.style.setProperty('--r', Math.floor(cell / COLS));
        this.discLayer.append(disc);
        this.discs.set(cell, disc);
        if (cell === drop) this.fall(disc, Math.floor(cell / COLS));
      }
      this.paint(disc, owner);
    });
    const last = game.moves.length ? lastCell(game) : null;
    const line = new Set(game.result?.line ?? []);
    for (const [cell, disc] of this.discs) {
      disc.classList.toggle('last', cell === last && !line.size);
      disc.classList.toggle('win', line.has(cell));
    }
    this.el.classList.toggle('done', Boolean(game.result));
    this.refresh();
  }

  setActive(active) {
    this.active = active;
    this.refresh();
  }

  paint(disc, owner) {
    disc.className = disc.className.replace(/\b(me|them)\b/g, '').trim();
    disc.classList.add('disc', owner === this.seat ? 'me' : 'them');
  }

  fall(disc, row) {
    if (calm.matches) return;
    const cell = this.discLayer.getBoundingClientRect().width / COLS;
    const height = (row + 1) * cell;
    const bounce = Math.min(height * 0.12, cell * 0.3);
    disc.animate([
      { transform: `translateY(${-height}px)`, easing: 'cubic-bezier(.55, 0, 1, .45)' },
      { transform: 'translateY(0)', offset: 0.7, easing: 'cubic-bezier(0, .55, .45, 1)' },
      { transform: `translateY(${-bounce}px)`, offset: 0.85, easing: 'cubic-bezier(.55, 0, 1, .45)' },
      { transform: 'translateY(0)' },
    ], { duration: 300 + 55 * (row + 1) });
  }

  /** Show the ghost disc over a column, or hide it. */
  hover(col) {
    this.hoverCol = col;
    this.refresh();
  }

  refresh() {
    const game = this.game;
    const col = this.hoverCol;
    const show = this.active && game && col !== null && canDrop(game, col);
    this.ghost.hidden = !show;
    if (show) this.ghost.style.setProperty('--c', col);
    if (!this.buttons) return;
    this.el.classList.toggle('live', this.active);
    this.buttons.forEach((button, c) => {
      const free = game ? ROWS - game.heights[c] : ROWS;
      const ok = this.active && game && canDrop(game, c);
      button.setAttribute('aria-disabled', String(!ok));
      button.classList.toggle('hot', ok && c === col);
      button.setAttribute('aria-label', `Column ${c + 1}${free ? `, ${free} space${free === 1 ? '' : 's'} left` : ', full'}`);
    });
  }

  roving() {
    this.buttons?.forEach((button, c) => { button.tabIndex = c === this.focusCol ? 0 : -1; });
  }

  pick(col) {
    if (!this.active || !this.game || !canDrop(this.game, col)) return;
    this.onDrop?.(col);
  }

  key(event) {
    const moveTo = (col) => {
      event.preventDefault();
      this.focusCol = (col + COLS) % COLS;
      this.roving();
      this.buttons[this.focusCol].focus();
    };
    if (event.key === 'ArrowLeft') return moveTo(this.focusCol - 1);
    if (event.key === 'ArrowRight') return moveTo(this.focusCol + 1);
    if (event.key === 'Home') return moveTo(0);
    if (event.key === 'End') return moveTo(COLS - 1);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      return this.pick(this.focusCol);
    }
    if (/^[1-7]$/.test(event.key)) {
      event.preventDefault();
      moveTo(Number(event.key) - 1);
      this.pick(this.focusCol);
    }
  }

  /** Focus the column buttons, so the keyboard can play straight away. */
  focus() {
    const active = document.activeElement;
    if (active && active !== document.body && !this.el.contains(active)) return;   // don't pull focus from chat
    this.buttons?.[this.focusCol]?.focus({ preventScroll: true });
  }
}

function lastCell(game) {
  const col = game.moves.at(-1);
  return at(col, ROWS - game.heights[col]);
}
