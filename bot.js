// The computer opponent. It stands in for net.js's link: the page talks to it
// exactly as it would to a guest's browser, and it answers with the same
// messages, so the game itself doesn't know (or care) who is across the table.
import * as Rules from './rules.js';

const { COLS, ROWS } = Rules;
const ORDER = [3, 2, 4, 1, 5, 0, 6];          // search the middle columns first
const WIN = 1e6;

// How far ahead each level looks, and how often it just plays something.
export const LEVELS = {
  easy: { name: 'Easy', depth: 2, wander: 0.45 },
  medium: { name: 'Medium', depth: 4, wander: 0.08 },
  hard: { name: 'Hard', depth: 8, wander: 0 },
};

/** Same shape as openLink() in net.js. */
export function openBot({ level, on }) {
  const skill = LEVELS[level] ?? LEVELS.medium;
  let game = null;
  let seat = 1;
  let timer = 0;
  let closed = false;

  const reply = (message) => { if (!closed) on.message?.(message); };

  function think() {
    clearTimeout(timer);
    if (closed || !game || game.result || game.turn !== seat) return;
    const started = performance.now();
    const col = choose(game, seat, skill);
    // Take a moment, like a person would, but don't add to a long think.
    const wait = Math.max(0, 500 + Math.random() * 600 - (performance.now() - started));
    timer = setTimeout(() => {
      if (closed || !game || game.result || game.turn !== seat) return;
      Rules.drop(game, col);
      reply({ t: 'move', col, n: game.moves.length });
    }, wait);
  }

  setTimeout(() => { if (!closed) on.open?.(); }, 0);

  return {
    connected: true,
    send(message) {
      switch (message?.t) {
        case 'start':
          seat = message.guestSeat;
          game = Rules.newGame();
          return think();
        case 'sync':
          seat = message.guestSeat;
          game = Rules.replay(message.moves, message.resigned);
          return think();
        case 'move':
          if (!game || Rules.drop(game, message.col) === null) return reply({ t: 'resync' });
          return think();
        case 'resign':
          if (game) Rules.resign(game, 1 - seat);
          return clearTimeout(timer);
      }
    },
    setMedia() {},
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

// ── Choosing a column ────────────────────────────────────────────────────────
// A negamax search with alpha-beta pruning over a plain copy of the board.
// Cells hold 0 (empty), 1 (the side to move at the root) or 2 (the other side).

function choose(game, seat, skill) {
  const legal = ORDER.filter((col) => game.heights[col] < ROWS);
  const cells = Int8Array.from(game.cells, (owner) => (owner === null ? 0 : owner === seat ? 1 : 2));
  const heights = Int8Array.from(game.heights);

  // Even an easy player takes a win that's sitting there, and usually blocks one.
  const winning = legal.find((col) => winsAt(cells, heights, col, 1));
  if (winning !== undefined) return winning;
  const threat = legal.find((col) => winsAt(cells, heights, col, 2));
  if (threat !== undefined && Math.random() > skill.wander / 2) return threat;
  if (Math.random() < skill.wander) return legal[Math.floor(Math.random() * legal.length)];

  let best = -Infinity;
  let picks = [];
  for (const col of legal) {
    play(cells, heights, col, 1);
    const value = -search(cells, heights, skill.depth - 1, -Infinity, -best + 1, 2, col);
    undo(cells, heights, col);
    if (value > best) { best = value; picks = [col]; }
    else if (value === best) picks.push(col);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

function play(cells, heights, col, who) {
  cells[(ROWS - 1 - heights[col]) * COLS + col] = who;
  heights[col]++;
}

function undo(cells, heights, col) {
  heights[col]--;
  cells[(ROWS - 1 - heights[col]) * COLS + col] = 0;
}

/** Would `who` make four by dropping in `col`? */
function winsAt(cells, heights, col, who) {
  if (heights[col] >= ROWS) return false;
  play(cells, heights, col, who);
  const won = fourAt(cells, col, ROWS - heights[col], who);
  undo(cells, heights, col);
  return won;
}

function fourAt(cells, col, row, who) {
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let run = 1;
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && cells[r * COLS + c] === who) {
        run++;
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (run >= 4) return true;
  }
  return false;
}

/** The value of the position for `who`, who is about to move; `last` is the column just played. */
function search(cells, heights, depth, alpha, beta, who, last) {
  const other = 3 - who;
  if (fourAt(cells, last, ROWS - heights[last], other)) return -WIN - depth;   // sooner losses are worse
  let any = false;
  for (const col of ORDER) if (heights[col] < ROWS) { any = true; break; }
  if (!any) return 0;
  if (depth === 0) return evaluate(cells, who);
  for (const col of ORDER) {
    if (heights[col] >= ROWS) continue;
    play(cells, heights, col, who);
    const value = -search(cells, heights, depth - 1, -beta, -alpha, other, col);
    undo(cells, heights, col);
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }
  return alpha;
}

// Every line of four cells on the board, found once.
const WINDOWS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const endC = c + dc * 3;
      const endR = r + dr * 3;
      if (endC < 0 || endC >= COLS || endR < 0 || endR >= ROWS) continue;
      WINDOWS.push([0, 1, 2, 3].map((k) => (r + dr * k) * COLS + c + dc * k));
    }
  }
}

/** A rough score: open lines of two and three, and discs in the middle column. */
function evaluate(cells, who) {
  const other = 3 - who;
  let total = 0;
  for (const window of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const cell of window) {
      if (cells[cell] === who) mine++;
      else if (cells[cell] === other) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) total += 50;
    else if (mine === 2) total += 6;
    else if (theirs === 3) total -= 60;
    else if (theirs === 2) total -= 6;
  }
  for (let r = 0; r < ROWS; r++) {
    const owner = cells[r * COLS + 3];
    if (owner === who) total += 4;
    else if (owner === other) total -= 4;
  }
  return total;
}
