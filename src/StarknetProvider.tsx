import { useMemo, type ReactNode } from 'react';
import { mainnet, sepolia } from '@starknet-react/chains';
import { StarknetConfig, jsonRpcProvider } from '@starknet-react/core';
import { ControllerConnector } from '@cartridge/connector';
import { constants } from 'starknet';

type StarknetProviderProps = {
  children: ReactNode;
};

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const RPC_URL = env.VITE_RPC_URL || env.NEXT_PUBLIC_RPC_URL || '';
const KEYCHAIN_URL = env.VITE_KEYCHAIN_URL || '';
export const CHAINS = [sepolia, mainnet];
const CONTROLLER_DEFAULTS = {
  [sepolia.id]: 'https://api.cartridge.gg/x/starknet/sepolia',
  [mainnet.id]: 'https://api.cartridge.gg/x/starknet/mainnet',
};

export const resolveControllerRpcUrl = (chainId: number) => {
  const fallback = CONTROLLER_DEFAULTS[chainId as keyof typeof CONTROLLER_DEFAULTS];
  if (!RPC_URL) return fallback;
  try {
    const url = new URL(RPC_URL);
    const path = url.pathname.toLowerCase();
    if (path.includes('starknet') && (path.includes('sepolia') || path.includes('mainnet'))) {
      return RPC_URL;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

export const getDefaultChainId = () =>
  import.meta.env.PROD ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA;

export const getControllerOptions = () => {
  const options: {
    chains: { rpcUrl: string }[];
    defaultChainId: string;
    signupOptions: string[];
    lazyload: boolean;
    url?: string;
    origin?: string;
  } = {
    chains: CHAINS.map((chain) => ({
      rpcUrl: resolveControllerRpcUrl(chain.id),
    })),
    defaultChainId: getDefaultChainId(),
    // Minimize auth options to avoid WebAuthn / WalletConnect issues during testing.
    signupOptions: ['google', 'password'],
    lazyload: true,
  };

  if (KEYCHAIN_URL) {
    options.url = KEYCHAIN_URL;
    try {
      options.origin = new URL(KEYCHAIN_URL).origin;
    } catch {
      // Ignore invalid URL; Controller will fall back to defaults.
    }
  }

  return options;
};

export const cartridgeConnector = new ControllerConnector(getControllerOptions());

export default function StarknetProvider({ children }: StarknetProviderProps) {
  const chains = CHAINS;
  const defaultChainId = getDefaultChainId();

  const provider = useMemo(
    () =>
      jsonRpcProvider({
        rpc: (chain) => {
          const nodeUrl =
            chain.id === sepolia.id ? RPC_URL || chain.rpcUrls.public.http[0] : chain.rpcUrls.public.http[0];
          return nodeUrl ? { nodeUrl } : null;
        },
      }),
    []
  );

  const connectors = useMemo(() => [cartridgeConnector], []);

  return (
    <StarknetConfig chains={chains} provider={provider} connectors={connectors}>
      {children}
    </StarknetConfig>
  );
}
