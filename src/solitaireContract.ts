import solitaireAbi from './abi/solitaire.json';

export const SOLITAIRE_ADDRESS =
  '0x06977d476524abb3b5e5a59753fe54077fc1c23f0222015f784fef6167fc3be2';

const rawAbi = solitaireAbi as unknown;
const normalizedAbi = Array.isArray(rawAbi)
  ? rawAbi
  : Array.isArray((rawAbi as { default?: unknown })?.default)
    ? (rawAbi as { default?: unknown }).default
    : (rawAbi as { abi?: unknown })?.abi;

export const SOLITAIRE_ABI = (Array.isArray(normalizedAbi) ? normalizedAbi : []) as const;
export const SOLITAIRE_ABI_READY = SOLITAIRE_ABI.length > 0;
