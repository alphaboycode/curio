import { JsonRpcProvider, Contract } from 'ethers';
import CurioAbi from './CurioNFTMarketplaceAbi.json';

// Deployed CurioNFTMarketplace address on Botchain Mainnet (Chain ID: 677)
export const CURIO_CONTRACT_ADDRESS =
  import.meta.env.VITE_CURIO_CONTRACT_ADDRESS || '0x37972DCed63F6bB8356AE002DE75FEB2b37dAB9D';

export const BOTCHAIN_NETWORK_CONFIG = {
  chainId: 677,
  chainIdHex: '0x2a5',
  chainName: 'Botchain Mainnet',
  rpcUrls: [import.meta.env.VITE_RPC_URL || 'https://rpc.botchain.ai'],
  nativeCurrency: {
    name: 'BOT',
    symbol: 'BOT',
    decimals: 18,
  },
  blockExplorerUrls: [import.meta.env.VITE_EXPLORER_URL || 'https://scan.botchain.ai'],
};

export const CURRENCY_SYMBOL = import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL || 'BOT';

export const CURIO_ABI = CurioAbi;

let readOnlyProviderInstance: JsonRpcProvider | null = null;

export function getReadOnlyProvider(): JsonRpcProvider {
  if (!readOnlyProviderInstance) {
    readOnlyProviderInstance = new JsonRpcProvider(
      BOTCHAIN_NETWORK_CONFIG.rpcUrls[0],
      {
        chainId: BOTCHAIN_NETWORK_CONFIG.chainId,
        name: BOTCHAIN_NETWORK_CONFIG.chainName,
      },
      { staticNetwork: true }
    );
  }
  return readOnlyProviderInstance;
}

export function getReadOnlyContract(address: string = CURIO_CONTRACT_ADDRESS): Contract {
  return new Contract(address, CURIO_ABI, getReadOnlyProvider());
}

export interface NFTItem {
  tokenId: bigint;
  tokenURI: string;
  owner: string;
  seller: string;
  price: bigint;
  isListed: boolean;
}

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  external_url?: string;
}

export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
];

/**
 * Resolves IPFS URIs (ipfs://CID/...) to an HTTP gateway URL for frontend display
 */
export function resolveIPFS(uri: string, gatewayIndex = 0): string {
  if (!uri) return 'https://placehold.co/400x400/161b26/a855f7?text=Curio+NFT';
  if (uri.startsWith('ipfs://')) {
    const path = uri.replace('ipfs://', '');
    const gateway = IPFS_GATEWAYS[gatewayIndex % IPFS_GATEWAYS.length];
    return `${gateway}${path}`;
  }
  return uri;
}

// In-memory metadata cache to prevent duplicate fetches
const metadataCache = new Map<string, NFTMetadata>();

export function getCachedNFTMetadata(uri: string): NFTMetadata | undefined {
  return metadataCache.get(uri);
}

/**
 * Asynchronously fetch and parse NFT metadata from tokenURI with multi-gateway fallback
 */
export async function fetchNFTMetadata(uri: string): Promise<NFTMetadata> {
  if (!uri) return {};
  if (metadataCache.has(uri)) {
    return metadataCache.get(uri)!;
  }

  // If tokenURI directly points to an image file, treat as direct image
  if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(uri)) {
    const meta: NFTMetadata = { image: uri };
    metadataCache.set(uri, meta);
    return meta;
  }

  // Iterate over gateways with generous timeouts
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    const httpUrl = resolveIPFS(uri, i);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(httpUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (json && (json.name || json.image || json.description)) {
            metadataCache.set(uri, json);
            return json;
          }
        } catch {
          // If response body is not JSON, check if it's directly image data
          const contentType = res.headers.get('content-type') || '';
          if (contentType.startsWith('image/')) {
            const meta = { image: httpUrl };
            metadataCache.set(uri, meta);
            return meta;
          }
        }
      }
    } catch {
      // Try next gateway
    }
  }

  return {};
}
