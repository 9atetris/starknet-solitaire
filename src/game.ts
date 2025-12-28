export type Suit = 'S' | 'H' | 'D' | 'C';

export type Card = {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
};

export type PileRef = {
  type: 'waste' | 'tableau' | 'foundation';
  index: number;
  cardIndex: number;
};

export type GameState = {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS = Array.from({ length: 13 }, (_, i) => i + 1);

export const isRedSuit = (suit: Suit) => suit === 'H' || suit === 'D';

export const getCardLabel = (card: Card) => {
  const rankLabel =
    card.rank === 1
      ? 'A'
      : card.rank === 11
        ? 'J'
        : card.rank === 12
          ? 'Q'
          : card.rank === 13
            ? 'K'
            : String(card.rank);
  return `${rankLabel}${card.suit}`;
};

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export const getDailySeed = () => {
  const now = new Date();
  const dateKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}`;
  return Number(dateKey);
};

export const getRandomSeed = () => {
  const now = Date.now();
  const jitter = Math.floor(Math.random() * 1000000);
  return now + jitter;
};

const shuffle = (cards: Card[], seed: number) => {
  const rng = mulberry32(seed);
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

export const createNewGame = (seed: number): GameState => {
  let counter = 0;
  const deck = shuffle(
    SUITS.flatMap((suit) =>
      RANKS.map((rank) => {
        counter += 1;
        return {
          id: `${rank}${suit}-${seed}-${counter}`,
          suit,
          rank,
          faceUp: false,
        };
      })
    ),
    seed
  );

  const tableau: Card[][] = Array.from({ length: 7 }, () => []);
  let deckIndex = 0;
  for (let column = 0; column < tableau.length; column += 1) {
    for (let row = 0; row <= column; row += 1) {
      const card = deck[deckIndex];
      tableau[column].push({ ...card, faceUp: row === column });
      deckIndex += 1;
    }
  }

  const stock = deck.slice(deckIndex).map((card) => ({ ...card, faceUp: false }));

  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
  };
};

export const dealFromStock = (state: GameState): GameState => {
  if (state.stock.length === 0) return state;
  const stock = [...state.stock];
  const nextCard = stock.pop()!;
  const waste = [...state.waste, { ...nextCard, faceUp: true }];
  return { ...state, stock, waste };
};

export const recycleWaste = (state: GameState): GameState => {
  if (state.waste.length === 0) return state;
  const stock = state.waste.map((card) => ({ ...card, faceUp: false })).reverse();
  return { ...state, stock, waste: [] };
};

const getPile = (state: GameState, ref: PileRef) => {
  if (ref.type === 'waste') return state.waste;
  if (ref.type === 'foundation') return state.foundations[ref.index];
  return state.tableau[ref.index];
};

const updatePile = (state: GameState, ref: PileRef, nextPile: Card[]) => {
  if (ref.type === 'waste') return { ...state, waste: nextPile };
  if (ref.type === 'foundation') {
    const foundations = state.foundations.map((pile, idx) => (idx === ref.index ? nextPile : pile));
    return { ...state, foundations };
  }
  const tableau = state.tableau.map((pile, idx) => (idx === ref.index ? nextPile : pile));
  return { ...state, tableau };
};

const revealTop = (column: Card[]) => {
  if (column.length === 0) return column;
  const last = column[column.length - 1];
  if (last.faceUp) return column;
  const next = [...column];
  next[next.length - 1] = { ...last, faceUp: true };
  return next;
};

export const moveStack = (state: GameState, from: PileRef, to: PileRef) => {
  const fromPile = getPile(state, from);
  const toPile = getPile(state, to);
  const moving = fromPile.slice(from.cardIndex);
  const remaining = fromPile.slice(0, from.cardIndex);
  let nextState = updatePile(state, from, remaining);
  nextState = updatePile(nextState, to, [...toPile, ...moving]);

  if (from.type === 'tableau') {
    const table = nextState.tableau.map((pile, idx) => (idx === from.index ? revealTop(pile) : pile));
    nextState = { ...nextState, tableau: table };
  }

  return nextState;
};

export const canMoveToFoundation = (
  state: GameState,
  selected: PileRef,
  foundationIndex: number
) => {
  const fromPile = getPile(state, selected);
  if (fromPile.length === 0) return null;
  const card = fromPile[selected.cardIndex];
  if (!card) return null;
  if (selected.type === 'tableau' && selected.cardIndex !== fromPile.length - 1) return null;
  if (selected.type === 'tableau' && !card.faceUp) return null;

  const foundation = state.foundations[foundationIndex];
  const top = foundation[foundation.length - 1];
  if (!top && card.rank !== 1) return null;
  if (top && (top.suit !== card.suit || card.rank !== top.rank + 1)) return null;

  const next = moveStack(state, selected, {
    type: 'foundation',
    index: foundationIndex,
    cardIndex: foundation.length,
  });
  return { next };
};

export const canMoveToTableau = (state: GameState, selected: PileRef, targetColumn: number) => {
  const fromPile = getPile(state, selected);
  if (fromPile.length === 0) return null;
  const card = fromPile[selected.cardIndex];
  if (!card || !card.faceUp) return null;

  const targetPile = state.tableau[targetColumn];
  const targetTop = targetPile[targetPile.length - 1];

  if (!targetTop) {
    if (card.rank !== 13) return null;
  } else {
    if (isRedSuit(targetTop.suit) === isRedSuit(card.suit)) return null;
    if (card.rank !== targetTop.rank - 1) return null;
  }

  const next = moveStack(state, selected, {
    type: 'tableau',
    index: targetColumn,
    cardIndex: targetPile.length,
  });
  return { next };
};

export const canMoveToTableauFromFoundation = (
  state: GameState,
  selected: PileRef,
  targetColumn: number
) => {
  if (selected.type !== 'foundation') return null;
  return canMoveToTableau(state, selected, targetColumn);
};

export const canMoveToFoundationFromTableau = (
  state: GameState,
  selected: PileRef,
  foundationIndex: number
) => {
  if (selected.type !== 'tableau') return null;
  return canMoveToFoundation(state, selected, foundationIndex);
};

export const canMoveToTableauFromWaste = (
  state: GameState,
  selected: PileRef,
  targetColumn: number
) => {
  if (selected.type !== 'waste') return null;
  return canMoveToTableau(state, selected, targetColumn);
};
