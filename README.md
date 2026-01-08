# Neon Solitaire (Starknet Sepolia)

Neon-themed Klondike solitaire with a Starknet-ready UI scaffold and a reference Cairo contract.

## Quick start

```bash
npm install
npm run dev
```

## Cloudflare Tunnel (optional)

When using a Cloudflare Tunnel, keep `cloudflared` running; the tunnel URL changes on restart.

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

Vite check:

```bash
curl -I http://127.0.0.1:5173/
```

For convenience, use:

```bash
npm run tunnel
```

## Notes

- The game runs fully in the client for responsiveness.
- The wallet button is wired to the Cartridge Controller SDK.
- Daily seed is derived from UTC date for now; swap in on-chain seed logic when you wire the contract.
- Contract address (Sepolia): `0x0003b1561355a86725b56c6ae11a1a3f979eb097f30bc2583dfd547a8062f777`.

## Cairo reference

See `contracts/solitaire.cairo` for a minimal score/seed interface.
