type CartridgeConnectResponse = {
  account?: string | { address?: string };
};

type StarknetProvider = {
  enable?: (options?: { wallet?: string }) => Promise<string[]>;
  account?: { address?: string };
  selectedAddress?: string;
};

export const connectCartridge = async (): Promise<string | null> => {
  const w = window as typeof window & {
    cartridge?: { connect?: () => Promise<CartridgeConnectResponse> };
    starknet?: StarknetProvider;
  };

  if (w.cartridge?.connect) {
    const response = await w.cartridge.connect();
    if (typeof response?.account === 'string') return response.account;
    return response?.account?.address ?? null;
  }

  if (w.starknet?.enable) {
    await w.starknet.enable({ wallet: 'cartridge' });
    return w.starknet.account?.address ?? w.starknet.selectedAddress ?? null;
  }

  throw new Error('Cartridge not found');
};
