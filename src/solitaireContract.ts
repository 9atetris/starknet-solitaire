import solitaireAbi from './abi/solitaire.json';

export const SOLITAIRE_ADDRESS =
  '0x0003b1561355a86725b56c6ae11a1a3f979eb097f30bc2583dfd547a8062f777';

const rawAbi = solitaireAbi as unknown;
const normalizedAbi = Array.isArray(rawAbi)
  ? rawAbi
  : Array.isArray((rawAbi as { default?: unknown })?.default)
    ? (rawAbi as { default?: unknown }).default
    : (rawAbi as { abi?: unknown })?.abi;

export const SOLITAIRE_ABI = Array.isArray(normalizedAbi) ? normalizedAbi : [];
export const SOLITAIRE_ABI_READY = SOLITAIRE_ABI.length > 0;
