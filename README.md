# Curio — NFT Marketplace on Botchain Testnet

Curio is an all-in-one NFT minting and marketplace smart contract and decentralized application (dApp). It enables users to mint NFTs with custom media and metadata on **Pinata IPFS**, list NFTs for sale at custom native token prices (**BOT**), and buy NFTs directly on-chain with **zero platform selling fees** — without requiring external indexers (such as The Graph or off-chain databases).

---

## 🌐 Botchain Testnet Deployment Details

- **Network Name**: Botchain Testnet (Bohr Life)
- **Chain ID**: `968` (`0x3c8`)
- **RPC URL**: [https://rpc.bohr.life](https://rpc.bohr.life)
- **Native Currency**: `BOT` (18 Decimals)
- **Total Supply**: 150 Million BOT
- **Block Explorer**: [https://scan.bohr.life](https://scan.bohr.life)
- **Deployed Contract Address**: [`0x5F21A463B9f89ACA481056504e461eBa2cBd704f`](https://scan.bohr.life/address/0x5F21A463B9f89ACA481056504e461eBa2cBd704f)
- **Deployment Tx Hash**: [`0x1e3d629b3b82e27fa7d403dfc2a2667e04182c68d4e0a91449c48f8164164646`](https://scan.bohr.life/tx/0x1e3d629b3b82e27fa7d403dfc2a2667e04182c68d4e0a91449c48f8164164646)
- **Genesis Mint Tx Hash (Token #1)**: [`0x6acbb570b4fe4454f10a7941566b8d0c6bb1e582a4e0b70ec66050e58f7c784e`](https://scan.bohr.life/tx/0x6acbb570b4fe4454f10a7941566b8d0c6bb1e582a4e0b70ec66050e58f7c784e)
- **Genesis Listing Tx Hash**: [`0xc19e5e01519c32dbe2d86d896a49e1be3e48c54efce762de84aeeb48b2281689`](https://scan.bohr.life/tx/0xc19e5e01519c32dbe2d86d896a49e1be3e48c54efce762de84aeeb48b2281689)

---

## 🏛 Architecture & Design Highlights

1. **Single Contract Architecture**:
   - `CurioNFTMarketplace.sol` combines ERC721 metadata storage (`ERC721URIStorage`), user token tracking, and marketplace listing/escrow/sales logic in a single Solidity contract.
2. **Indexer-less On-Chain Enumeration**:
   - Maintains `_userTokens` and `_userTokenIndex` mappings using $O(1)$ swap-and-pop removal upon transfers and purchases.
   - Maintains `_activeListingTokenIds` and `_activeListingIndex` mappings for instant $O(1)$ additions and removals of active listings.
   - Exposes `getUserNFTs(address user)` and `getAllActiveListings()` view functions that return full `NFTItem` structures (including token ID, tokenURI, seller, price, and listing status) in a single RPC query.
3. **Zero Platform Selling Fees**:
   - 100% of the sale price goes directly to the seller via native tokens (`BOT`).
   - Excess payments sent by buyers are automatically refunded.
4. **Pinata IPFS Integration**:
   - Automated 2-phase uploading: image files are uploaded directly to Pinata (`pinFileToIPFS`), then ERC-721 metadata JSON referencing the IPFS image is created and uploaded (`pinJSONToIPFS`).
   - Authenticated via Pinata Scoped JWT stored safely in `.env`.
5. **Marketplace Transfer Protection**:
   - Overrides ERC721 `_update` to prevent listed NFTs from being transferred outside the marketplace without first canceling the listing.
6. **Security & Standards**:
   - OpenZeppelin Contracts v5.1.0 (`ERC721URIStorage`, `ReentrancyGuard`).
   - Checks-Effects-Interactions (CEI) pattern strictly adhered to for all external transfers and state updates.

---

## 📁 Project Structure

```
curio/
├── src/
│   └── CurioNFTMarketplace.sol     # The Curio NFT & Marketplace smart contract
├── test/
│   └── CurioNFTMarketplace.t.sol   # Foundry test suite (22 unit & integration tests)
├── script/
│   └── Deploy.s.sol                # Foundry deployment script
├── frontend/                       # Vite + React (TypeScript) + Tailwind CSS dApp
│   ├── src/
│   │   ├── components/
│   │   │   └── NFTCard.tsx         # Media preview, metadata resolver, card actions
│   │   ├── services/
│   │   │   └── pinata.ts           # Pinata IPFS file & metadata upload service
│   │   ├── contracts/
│   │   │   ├── CurioNFTMarketplaceAbi.json
│   │   │   └── config.ts           # Botchain network config & contract address
│   │   ├── App.tsx                 # Full Marketplace, Collection, Minting & Info UI
│   │   └── index.css               # Tailwind CSS styling
│   ├── .env                        # Network and Pinata JWT configuration
│   └── package.json
├── foundry.toml                    # Foundry configuration
└── package.json                    # Workspace root scripts
```

---

## 🚀 Getting Started

### 1. Environment Configuration

The frontend is pre-configured with the deployed contract and Pinata JWT in `frontend/.env`:

```env
VITE_CURIO_CONTRACT_ADDRESS=0x5F21A463B9f89ACA481056504e461eBa2cBd704f
VITE_CHAIN_ID=968
VITE_RPC_URL=https://rpc.bohr.life
VITE_NATIVE_CURRENCY_SYMBOL=BOT
VITE_EXPLORER_URL=https://scan.bohr.life
VITE_PINATA_JWT=your_pinata_jwt
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

### 2. Frontend Development Server

Start the local Vite development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Smart Contract Verification & Interaction

Interact with the contract directly via `cast`:

```bash
# Query contract name
cast call 0x5F21A463B9f89ACA481056504e461eBa2cBd704f "name()(string)" --rpc-url https://rpc.bohr.life

# Query all active marketplace listings
cast call 0x5F21A463B9f89ACA481056504e461eBa2cBd704f "getAllActiveListings()((uint256,string,address,address,uint256,bool)[])" --rpc-url https://rpc.bohr.life

# Query total minted NFTs
cast call 0x5F21A463B9f89ACA481056504e461eBa2cBd704f "totalMinted()(uint256)" --rpc-url https://rpc.bohr.life
```
