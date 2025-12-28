import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useReadContract } from '@starknet-react/core';
import { Contract } from 'starknet';
import {
  canMoveToFoundation,
  canMoveToTableau,
  createNewGame,
  dealFromStock,
  getCardLabel,
  getDailySeed,
  getRandomSeed,
  isRedSuit,
  recycleWaste,
  type GameState,
  type PileRef,
} from './game';
import WalletConnect from './WalletConnect';
import VictoryOverlay from './VictoryOverlay';
import { SOLITAIRE_ABI, SOLITAIRE_ABI_READY, SOLITAIRE_ADDRESS } from './solitaireContract';

const DRAG_THRESHOLD = 6;
const MAX_HISTORY = 200;

type DragSourceType = 'tableau' | 'waste' | 'foundation';

type DragPayload = {
  sourceType: DragSourceType;
  sourceIndex: number;
  startIndex: number;
  cardIds: string[];
};

type DragState = {
  payload: DragPayload;
  cards: GameState['tableau'][number];
  pointer: { x: number; y: number };
  offset: { x: number; y: number };
  stackStep: number;
  hover: { type: 'tableau' | 'foundation'; index: number; valid: boolean } | null;
};

type GameSnapshot = {
  game: GameState;
  moves: number;
};

type HistoryState = {
  past: GameSnapshot[];
  present: GameSnapshot;
  future: GameSnapshot[];
};

export default function App() {
  const [seed, setSeed] = useState(() => getDailySeed());
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: { game: createNewGame(seed), moves: 0 },
    future: [],
  }));
  const [startTime, setStartTime] = useState(() => Date.now());
  const [victoryOpen, setVictoryOpen] = useState(false);
  const [victorySeen, setVictorySeen] = useState(false);
  const [boardPulse, setBoardPulse] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<PileRef | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitTx, setSubmitTx] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<{
    payload: DragPayload;
    start: { x: number; y: number };
    offset: { x: number; y: number };
  } | null>(null);
  const edgeSwipeRef = useRef<{ x: number; y: number } | null>(null);
  const listenersAttachedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const foundationRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tableauRef = useRef<HTMLDivElement | null>(null);
  const { account, address, isConnected } = useAccount();
  const { data: onchainTotal } = useReadContract({
    abi: SOLITAIRE_ABI,
    address: SOLITAIRE_ADDRESS,
    functionName: 'get_my_total',
    args: address ? [address] : undefined,
    enabled: Boolean(address) && SOLITAIRE_ABI_READY,
    retry: false,
    refetchInterval: false,
  });
  const onchainTotalStr = onchainTotal != null ? (onchainTotal as any).toString() : '—';
  const clampU16 = (n: number) => Math.max(0, Math.min(65535, n | 0));

  const game = history.present.game;

  const win = useMemo(() => {
    return game.foundations.every((pile) => pile.length === 13);
  }, [game.foundations]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientX <= 24) {
        edgeSwipeRef.current = { x: touch.clientX, y: touch.clientY };
      } else {
        edgeSwipeRef.current = null;
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = edgeSwipeRef.current;
      if (!start) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 10 && dx > dy) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);


  const commitGame = (next: GameState) => {
    setHistory((prev) => {
      const past = [...prev.past, prev.present];
      if (past.length > MAX_HISTORY) {
        past.shift();
      }
      return {
        past,
        present: { game: next, moves: prev.present.moves + 1 },
        future: [],
      };
    });
  };

  const resetGame = () => {
    const nextSeed = getRandomSeed();
    setSeed(nextSeed);
    setSelected(null);
    setVictoryOpen(false);
    setVictorySeen(false);
    setSubmitStatus('idle');
    setSubmitTx(null);
    setSubmitError(null);
    setHistory({
      past: [],
      present: { game: createNewGame(nextSeed), moves: 0 },
      future: [],
    });
    setStartTime(Date.now());
  };

  useEffect(() => {
    if (win) {
      if (!victorySeen) {
        setVictorySeen(true);
        setVictoryOpen(true);
        setBoardPulse(true);
        setTimeout(() => setBoardPulse(false), 800);
      }
      return;
    }
    setVictorySeen(false);
    setVictoryOpen(false);
  }, [win, victorySeen]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useLayoutEffect(() => {
    const updateCardMetrics = () => {
      if (!tableauRef.current) return;
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      if (window.innerWidth > 900 || !isLandscape) return;
      const style = getComputedStyle(tableauRef.current);
      const gap = parseFloat(style.columnGap || style.gap || '0');
      const width = tableauRef.current.getBoundingClientRect().width;
      const totalGap = gap * 6;
      const raw = Math.floor((width - totalGap) / 7);
      const cardW = Math.min(54, Math.max(34, raw));
      const cardH = Math.round(cardW * 1.43);
      const stackStep = Math.max(10, Math.round(cardH * 0.22));
      const root = document.documentElement;
      root.style.setProperty('--cardW', `${cardW}px`);
      root.style.setProperty('--cardH', `${cardH}px`);
      root.style.setProperty('--stack-step', `${stackStep}px`);
    };

    updateCardMetrics();
    window.addEventListener('resize', updateCardMetrics);
    window.addEventListener('orientationchange', updateCardMetrics);
    return () => {
      window.removeEventListener('resize', updateCardMetrics);
      window.removeEventListener('orientationchange', updateCardMetrics);
    };
  }, []);

  const onStockClick = () => {
    setSelected(null);
    if (game.stock.length === 0) {
      const next = recycleWaste(game);
      if (next !== game) commitGame(next);
      return;
    }
    const next = dealFromStock(game);
    if (next !== game) commitGame(next);
  };

  const onWasteClick = () => {
    if (game.waste.length === 0) return;
    if (selected?.type === 'waste') {
      setSelected(null);
      return;
    }
    setSelected({ type: 'waste', index: 0, cardIndex: game.waste.length - 1 });
  };

  const isValidRun = (columnIndex: number, startIndex: number) => {
    const column = game.tableau[columnIndex];
    const run = column.slice(startIndex);
    if (run.length === 0) return null;
    if (run.some((card) => !card.faceUp)) return null;
    for (let i = 0; i < run.length - 1; i += 1) {
      const current = run[i];
      const next = run[i + 1];
      if (current.rank !== next.rank + 1) return null;
      if (isRedSuit(current.suit) === isRedSuit(next.suit)) return null;
    }
    return run;
  };

  const onTableauClick = (columnIndex: number, cardIndex: number) => {
    const column = game.tableau[columnIndex];
    const card = column[cardIndex];
    if (!card.faceUp) return;
    if (
      selected &&
      !(selected.type === 'tableau' && selected.index === columnIndex && selected.cardIndex === cardIndex)
    ) {
      const result = canMoveToTableau(game, selected, columnIndex);
      if (result) {
        commitGame(result.next);
        setSelected(null);
        return;
      }
    }
    if (selected?.type === 'tableau' && selected.index === columnIndex && selected.cardIndex === cardIndex) {
      setSelected(null);
      return;
    }
    setSelected({ type: 'tableau', index: columnIndex, cardIndex });
  };

  const onFoundationClick = (foundationIndex: number) => {
    const pile = game.foundations[foundationIndex];
    if (pile.length === 0) return;
    if (selected?.type === 'foundation' && selected.index === foundationIndex) {
      setSelected(null);
      return;
    }
    setSelected({ type: 'foundation', index: foundationIndex, cardIndex: pile.length - 1 });
  };

  const getStackStep = () => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--stack-step');
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 32;
  };

  const getDropTarget = (x: number, y: number, payload: DragPayload) => {
    for (let i = 0; i < foundationRefs.current.length; i += 1) {
      const el = foundationRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        if (payload.cardIds.length !== 1 || payload.sourceType === 'foundation') {
          return { type: 'foundation' as const, index: i, valid: false };
        }
        const selectedRef: PileRef =
          payload.sourceType === 'waste'
            ? { type: 'waste', index: 0, cardIndex: game.waste.length - 1 }
            : { type: 'tableau', index: payload.sourceIndex, cardIndex: payload.startIndex };
        const result = canMoveToFoundation(game, selectedRef, i);
        return { type: 'foundation' as const, index: i, valid: Boolean(result) };
      }
    }

    for (let i = 0; i < columnRefs.current.length; i += 1) {
      const el = columnRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const expandedBottom = rect.bottom + rect.height; // extend drop zone downward only
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= expandedBottom) {
        if (payload.sourceType === 'tableau' && payload.sourceIndex === i) {
          return { type: 'tableau' as const, index: i, valid: false };
        }
        const selectedRef: PileRef =
          payload.sourceType === 'waste'
            ? { type: 'waste', index: 0, cardIndex: game.waste.length - 1 }
            : payload.sourceType === 'foundation'
              ? {
                  type: 'foundation',
                  index: payload.sourceIndex,
                  cardIndex: game.foundations[payload.sourceIndex].length - 1,
                }
              : { type: 'tableau', index: payload.sourceIndex, cardIndex: payload.startIndex };
        const result = canMoveToTableau(game, selectedRef, i);
        return { type: 'tableau' as const, index: i, valid: Boolean(result) };
      }
    }

    return null;
  };

  const finalizeDrop = (state: DragState) => {
    if (!state.hover || !state.hover.valid) return;
    const selectedRef: PileRef =
      state.payload.sourceType === 'waste'
        ? { type: 'waste', index: 0, cardIndex: game.waste.length - 1 }
        : state.payload.sourceType === 'foundation'
          ? {
              type: 'foundation',
              index: state.payload.sourceIndex,
              cardIndex: game.foundations[state.payload.sourceIndex].length - 1,
            }
          : { type: 'tableau', index: state.payload.sourceIndex, cardIndex: state.payload.startIndex };

    if (state.hover.type === 'foundation') {
      const result = canMoveToFoundation(game, selectedRef, state.hover.index);
      if (result) {
        commitGame(result.next);
        setSelected(null);
      }
      return;
    }

    const result = canMoveToTableau(game, selectedRef, state.hover.index);
    if (result) {
      commitGame(result.next);
      setSelected(null);
    }
  };

  const handleTapFallback = (payload: DragPayload) => {
    if (payload.sourceType === 'waste') {
      onWasteClick();
      return;
    }
    if (payload.sourceType === 'foundation') {
      onFoundationClick(payload.sourceIndex);
      return;
    }
    onTableauClick(payload.sourceIndex, payload.startIndex);
  };

  const beginDrag = (event: React.PointerEvent<HTMLElement>, payload: DragPayload) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    pendingDragRef.current = {
      payload,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    };
    if (!listenersAttachedRef.current) {
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      listenersAttachedRef.current = true;
    }
    event.stopPropagation();
  };

  const onPointerMove = (event: PointerEvent) => {
    const pending = pendingDragRef.current;
    const active = dragStateRef.current;
    const point = { x: event.clientX, y: event.clientY };

    if (pending && !active) {
      const dx = point.x - pending.start.x;
      const dy = point.y - pending.start.y;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        const payload = pending.payload;
        let cards: GameState['tableau'][number] = [];
        if (payload.sourceType === 'waste') {
          const card = game.waste[game.waste.length - 1];
          if (!card) return;
          cards = [card];
        } else if (payload.sourceType === 'foundation') {
          const card = game.foundations[payload.sourceIndex]?.[game.foundations[payload.sourceIndex].length - 1];
          if (!card) return;
          cards = [card];
        } else {
          const run = isValidRun(payload.sourceIndex, payload.startIndex);
          if (!run) return;
          cards = run;
        }
        const stackStep = getStackStep();
        const hover = getDropTarget(point.x, point.y, payload);
        const nextState: DragState = {
          payload,
          cards,
          pointer: point,
          offset: pending.offset,
          stackStep,
          hover,
        };
        setDragState(nextState);
        pendingDragRef.current = null;
      }
    }

    if (dragStateRef.current) {
      event.preventDefault();
      const payload = dragStateRef.current.payload;
      const hover = getDropTarget(point.x, point.y, payload);
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              pointer: point,
              hover,
            }
          : prev
      );
    }
  };

  const onPointerUp = () => {
    const active = dragStateRef.current;
    if (active) {
      finalizeDrop(active);
    }
    if (pendingDragRef.current && !active) {
      handleTapFallback(pendingDragRef.current.payload);
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    pendingDragRef.current = null;
    setDragState(null);
    if (listenersAttachedRef.current) {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      listenersAttachedRef.current = false;
    }
  };

  const tryMoveToFoundation = (foundationIndex: number) => {
    if (!selected) return;
    if (selected.type === 'foundation') return;
    const result = canMoveToFoundation(game, selected, foundationIndex);
    if (!result) return;
    commitGame(result.next);
    setSelected(null);
  };

  const tryMoveToTableau = (targetColumn: number) => {
    if (!selected) return;
    const result = canMoveToTableau(game, selected, targetColumn);
    if (!result) return;
    commitGame(result.next);
    setSelected(null);
  };

  const onBackgroundClick = () => {
    setSelected(null);
  };

  const openHelp = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setHelpOpen(true);
  };

  const closeHelp = () => {
    setHelpOpen(false);
  };

  const submitResult = async () => {
    if (!account) {
      setSubmitStatus('error');
      setSubmitError('Wallet not connected.');
      return;
    }
    if (!SOLITAIRE_ABI_READY) {
      setSubmitStatus('error');
      setSubmitError('ABI not loaded.');
      return;
    }
    setSubmitStatus('submitting');
    setSubmitError(null);
    setSubmitTx(null);
    try {
      const timeSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const day = getDailySeed();
      const moves = clampU16(history.present.moves);
      const contract = new Contract({
        abi: SOLITAIRE_ABI as any,
        address: SOLITAIRE_ADDRESS,
        providerOrAccount: account as any,
      });
      const response = await contract.submit_result(day, timeSec, moves);
      const txHash =
        typeof response === 'string'
          ? response
          : response?.transaction_hash ?? response?.transactionHash ?? null;
      setSubmitTx(txHash);
      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('error');
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };


  const renderCardLabel = (label: string) => (
    <>
      <span className="card-label">{label}</span>
      <span className="card-label mirror">{label}</span>
    </>
  );

  const victoryStats = {
    moves: history.present.moves,
    timeMs: Date.now() - startTime,
    seed,
  };
  const onchainScore =
    typeof onchainTotal === 'bigint' ? onchainTotal.toString() : onchainTotal ? String(onchainTotal) : '0';

  return (
    <div className={`app ${boardPulse ? 'win-pulse' : ''}`} onClick={onBackgroundClick}>
      <header className="hud">
        <div className="hud-left">
          <span className="hud-title">Neon Solitaire</span>
          <span className="hud-seed">Seed {seed}</span>
        </div>
        <div className="hud-stats">
          <span>Score {onchainScore}</span>
          <span>Total {onchainTotalStr}</span>
          <span>Moves {history.present.moves}</span>
          <span>Time {Math.floor((Date.now() - startTime) / 1000)}s</span>
        </div>
        <div className="hud-actions">
          <button className="ghost" onClick={resetGame}>
            New
          </button>
          <WalletConnect />
          <button className="help-toggle" type="button" onClick={openHelp} aria-label="How to play">
            ?
          </button>
        </div>
      </header>

      <div className="board-shell">
        <main className="table">
        <section className="top-row">
          <div className="foundation-area">
            {game.foundations.map((pile, index) => {
              const canAcceptSelected =
                selected && selected.type !== 'foundation' ? canMoveToFoundation(game, selected, index) : null;
              const topCard = pile[pile.length - 1];
              return (
                <button
                  key={`foundation-${index}`}
                  className={`pile foundation ${
                    selected?.type === 'foundation' && selected.index === index ? 'selected' : ''
                  } ${
                    dragState?.hover?.type === 'foundation' && dragState.hover.index === index
                      ? dragState.hover.valid
                        ? 'drop-valid'
                        : 'drop-invalid'
                      : ''
                  } ${!dragState && canAcceptSelected ? 'drop-valid' : ''}`}
                  ref={(el) => {
                    foundationRefs.current[index] = el;
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selected) {
                      tryMoveToFoundation(index);
                    } else {
                      onFoundationClick(index);
                    }
                  }}
                >
                  {pile.length > 0 && topCard ? (
                    <div
                      className={`card face-up ${isRedSuit(topCard.suit) ? 'red' : 'black'}`}
                      onPointerDown={(event) =>
                        beginDrag(event, {
                          sourceType: 'foundation',
                          sourceIndex: index,
                          startIndex: pile.length - 1,
                          cardIds: [topCard.id],
                        })
                      }
                    >
                      {renderCardLabel(getCardLabel(topCard))}
                    </div>
                  ) : (
                    <span className="foundation-ghost">A</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="stock-area">
            <button className="pile stock" onClick={onStockClick} aria-label="Draw from stock">
              <div className="card card-back" />
              <span className="badge">{game.stock.length > 0 ? game.stock.length : '↻'}</span>
            </button>
            <button
              className="pile waste"
              onClick={(event) => {
                event.stopPropagation();
                if (suppressClickRef.current) return;
                if (!dragState) {
                  onWasteClick();
                }
              }}
            >
              {game.waste.length > 0 ? (
                <div
                  className={`card face-up ${isRedSuit(game.waste[game.waste.length - 1].suit) ? 'red' : 'black'}`}
                  onPointerDown={(event) =>
                    beginDrag(event, {
                      sourceType: 'waste',
                      sourceIndex: 0,
                      startIndex: game.waste.length - 1,
                      cardIds: [game.waste[game.waste.length - 1].id],
                    })
                  }
                >
                  {renderCardLabel(getCardLabel(game.waste[game.waste.length - 1]))}
                </div>
              ) : null}
            </button>
          </div>
        </section>

        <section className="tableau" ref={tableauRef}>
            {game.tableau.map((column, columnIndex) => {
              const canAcceptSelected = selected ? canMoveToTableau(game, selected, columnIndex) : null;
              return (
                <div
                  key={`column-${columnIndex}`}
                  className={`column ${columnIndex >= 4 ? 'row-2' : 'row-1'} ${
                    dragState?.hover?.type === 'tableau' && dragState.hover.index === columnIndex
                      ? dragState.hover.valid
                        ? 'drop-valid'
                        : 'drop-invalid'
                      : ''
                  } ${!dragState && canAcceptSelected ? 'drop-valid' : ''}`}
                  ref={(el) => {
                    columnRefs.current[columnIndex] = el;
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selected) {
                      tryMoveToTableau(columnIndex);
                    }
                  }}
                >
              <div className="column-cards">
                  {column.length === 0 ? (
                    <div className="pile empty-slot">Drop</div>
                  ) : (
                    column.map((card, cardIndex) => {
                      const isDraggingSource =
                        dragState?.payload.sourceType === 'tableau' && dragState.payload.sourceIndex === columnIndex;
                      const shouldGhost = isDraggingSource && cardIndex >= dragState.payload.startIndex;
                      return (
                      <button
                        key={card.id}
                        className={`card ${card.faceUp ? 'face-up' : 'face-down'} ${
                          selected?.type === 'tableau' &&
                          selected.index === columnIndex &&
                          selected.cardIndex === cardIndex
                            ? 'selected'
                            : ''
                        } ${card.faceUp ? (isRedSuit(card.suit) ? 'red' : 'black') : ''} ${
                          shouldGhost ? 'drag-ghost' : ''
                        }`}
                        style={{ top: `calc(var(--stack-step) * ${cardIndex})` }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressClickRef.current) return;
                          if (!dragState) {
                            onTableauClick(columnIndex, cardIndex);
                          }
                        }}
                        onPointerDown={(event) => {
                          if (!card.faceUp) return;
                          const run = isValidRun(columnIndex, cardIndex);
                          if (!run) return;
                          beginDrag(event, {
                            sourceType: 'tableau',
                            sourceIndex: columnIndex,
                            startIndex: cardIndex,
                            cardIds: run.map((c) => c.id),
                          });
                        }}
                      >
                        {card.faceUp && !shouldGhost ? renderCardLabel(getCardLabel(card)) : ''}
                      </button>
                      );
                    })
                  )}
                </div>
                </div>
              );
            })}
          </section>
        </main>
      </div>

      <aside className="sidebar">
        <div className="panel">
          <h2>How to play</h2>
          <ul>
            <li>Click / Tap stock to draw. Empty stock recycles waste.</li>
            <li>Select a card/stack, then click / tap a tableau column to move.</li>
            <li>Move a top card to foundations to build up by suit.</li>
          </ul>
        </div>
        <div className={`panel ${win ? 'win' : ''}`}>
          <h2>Victory</h2>
          <p>{win ? 'Cleared!' : 'Not cleared yet.'}</p>
          <button
            className="primary"
            disabled={!win || !isConnected || submitStatus === 'submitting'}
            onClick={submitResult}
          >
            {submitStatus === 'submitting'
              ? 'Submitting...'
              : submitStatus === 'success'
                ? 'Submitted'
                : 'Submit Victory'}
          </button>
        </div>
      </aside>
      <VictoryOverlay
        open={victoryOpen}
        stats={victoryStats}
        onClose={() => setVictoryOpen(false)}
        onNewGame={resetGame}
        onSubmit={submitResult}
        submitStatus={submitStatus}
        submitTx={submitTx}
        submitError={submitError}
        submitEnabled={isConnected && win}
      />
      {helpOpen ? (
        <div className="help-overlay" role="dialog" aria-modal="true" onClick={closeHelp}>
          <div className="help-card" onClick={(event) => event.stopPropagation()}>
            <button className="help-close" type="button" onClick={closeHelp} aria-label="Close help">
              ×
            </button>
            <h2>How to play</h2>
            <ul>
              <li>Click / Tap stock to draw. Empty stock recycles waste.</li>
              <li>Select a card/stack, then click / tap a tableau column to move.</li>
              <li>Move a top card to foundations to build up by suit.</li>
            </ul>
            <p className="help-warn">縦画面では表示が崩れる可能性があります。</p>
          </div>
        </div>
      ) : null}
      {dragState
        ? createPortal(
            <div className="drag-layer">
              {dragState.cards.map((card, index) => (
                <div
                  key={card.id}
                  className={`card face-up dragging ${isRedSuit(card.suit) ? 'red' : 'black'}`}
                  style={{
                    top: dragState.pointer.y - dragState.offset.y + index * dragState.stackStep,
                    left: dragState.pointer.x - dragState.offset.x,
                  }}
                >
                  {renderCardLabel(getCardLabel(card))}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
