import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { cartridgeConnector } from './StarknetProvider';

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connectAsync, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected && address) {
    return (
      <div className="wallet-status">
        <span className="wallet-chip">{shortAddress(address)}</span>
        <button className="ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-status">
      <button
        className="primary"
        onClick={async () => {
          if (!cartridgeConnector) return;
          try {
            console.log('[Cartridge] href:', window.location.href);
            console.log('[Cartridge] connectAsync start');
            await connectAsync({ connector: cartridgeConnector });
            console.log('[Cartridge] connectAsync success');
          } catch (err) {
            console.error('[Cartridge] connectAsync failed:', err);
          }
        }}
        disabled={!cartridgeConnector || status === 'connecting'}
      >
        <span className="label-long">Connect with Cartridge</span>
        <span className="label-short">Connect</span>
      </button>
      {!cartridgeConnector ? (
        <span className="wallet-hint">Cartridge connector not available.</span>
      ) : null}
      {error ? <span className="wallet-hint">Connection failed. Check console.</span> : null}
    </div>
  );
}
