import solitaireAbi from './abi/solitaire.json';

export const SOLITAIRE_ADDRESS =
  '0x022a5b0a44b5fe8aa041699c4c60a890490b296927a93b4acc9cf92af498a743';

const rawAbi = solitaireAbi as unknown;
const normalizedAbi = Array.isArray(rawAbi)
  ? rawAbi
  : Array.isArray((rawAbi as { default?: unknown })?.default)
    ? (rawAbi as { default?: unknown }).default
    : (rawAbi as { abi?: unknown })?.abi;

export const SOLITAIRE_ABI = Array.isArray(normalizedAbi) ? normalizedAbi : [];
export const SOLITAIRE_ABI_READY = SOLITAIRE_ABI.length > 0;
