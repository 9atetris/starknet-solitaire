import solitaireAbi from './abi/solitaire.json';

export const SOLITAIRE_ADDRESS =
  '0x006a67a6348e374c8a9b0be47bc407ecd22fcb7e7585a36a7b92f5794230c249';

const rawAbi = solitaireAbi as unknown;
const normalizedAbi = Array.isArray(rawAbi)
  ? rawAbi
  : Array.isArray((rawAbi as { default?: unknown })?.default)
    ? (rawAbi as { default?: unknown }).default
    : (rawAbi as { abi?: unknown })?.abi;

export const SOLITAIRE_ABI = (Array.isArray(normalizedAbi) ? normalizedAbi : []) as const;
export const SOLITAIRE_ABI_READY = SOLITAIRE_ABI.length > 0;
