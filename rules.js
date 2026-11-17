// The rules of Connect Four. Seven columns, six rows; discs drop to the lowest
// empty space. Four in a row (across, down or diagonally) wins; a full board
// is a draw. Players are 0 (who moves first) and 1.
export const COLS = 7;
export const ROWS = 6;

/** Cell index of (col, row), with row 0 at the top. */
export const at = (col, row) => row * COLS + col;

export function newGame() {
  return {
    cells: Array(COLS * ROWS).fill(null),   // null or the player whose disc is there
    heights: Array(COLS).fill(0),           // discs in each column
    moves: [],                              // the columns played, in order
    turn: 0,
    result: null,                           // { kind: 'four' | 'full' | 'resign', winner, line }
  };
}

export const canDrop = (game, col) => !game.result && Number.isInteger(col) && col >= 0 && col < COLS && game.heights[col] < ROWS;

/** Where a disc dropped in `col` would land, as a row. */
export const landing = (game, col) => ROWS - 1 - game.heights[col];

/** Drop the current player's disc in `col`. Returns the cell it landed in, or null. */
export function drop(game, col) {
  if (!canDrop(game, col)) return null;
  const row = landing(game, col);
  const cell = at(col, row);
  const player = game.turn;
  game.cells[cell] = player;
  game.heights[col]++;
  game.moves.push(col);
  const line = fourThrough(game.cells, col, row, player);
  if (line) game.result = { kind: 'four', winner: player, line };
  else if (game.moves.length === COLS * ROWS) game.result = { kind: 'full', winner: null, line: [] };
  game.turn = 1 - player;
  return cell;
}

/** Every cell in a run of four or more through (col, row), or null. */
function fourThrough(cells, col, row, player) {
  const line = new Set();
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const run = [at(col, row)];
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && cells[at(c, r)] === player) {
        run.push(at(c, r));
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (run.length >= 4) run.forEach((cell) => line.add(cell));
  }
  return line.size ? [...line] : null;
}

/** End the game off the board (a resignation). */
export function resign(game, loser) {
  if (!game.result) game.result = { kind: 'resign', winner: 1 - loser, line: [] };
}

/** Rebuild a game from its moves, or null if they don't make one. */
export function replay(moves, resigned = null) {
  if (!Array.isArray(moves) || moves.length > COLS * ROWS) return null;
  const game = newGame();
  for (const col of moves) if (drop(game, col) === null) return null;
  if (resigned === 0 || resigned === 1) resign(game, resigned);
  return game;
}
