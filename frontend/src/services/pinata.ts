/**
 * Pinata IPFS Service for Curio NFT Marketplace
 * Handles file and JSON metadata uploads to Pinata IPFS using JWT authentication.
 */

export const DEFAULT_PINATA_JWT = import.meta.env.VITE_PINATA_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5MmNlNTE3Ny0wZTU1LTQxOTItODQ1OS1kMzBjNDhjOTQ0OTciLCJlbWFpbCI6ImFscGhhYm95bWF4QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiIyYjZmY2U3ZjUxMGFkNDVlMjMzMCIsInNjb3BlZEtleVNlY3JldCI6IjMzMzA5NjQ5NGJjY2YxYzk1OGY2MGMyNzI0MDZmMTEzNGUwN2ZjM2RmOTk5ODM3ZGNkNjQyNzRiMDMzODU3Y2UiLCJleHAiOjE4MjM5MDI1MTJ9.ZyOmOhQwjN8ak2B8oQf9D0X21xcpI1iB2CtY-iSOz_I';
export const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

export interface PinataUploadResult {
  ipfsHash: string;
  ipfsUri: string;
  gatewayUrl: string;
}

export interface NFTMetadataInput {
  name: string;
  description: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}

/**
 * Test authentication with the Pinata API using the provided or default JWT.
 */
export async function testPinataConnection(jwt: string = DEFAULT_PINATA_JWT): Promise<boolean> {
  if (!jwt) return false;
  try {
    const res = await fetch('https://api.pinata.cloud/data/testAuthentication', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt.trim()}`,
      },
    });
    return res.ok;
  } catch (err) {
    console.error('Pinata connection test failed:', err);
    return false;
  }
}

/**
 * Upload an image or media file to Pinata IPFS.
 */
export async function uploadFileToPinata(
  file: File,
  jwt: string = DEFAULT_PINATA_JWT
): Promise<PinataUploadResult> {
  const token = jwt.trim();
  if (!token) {
    throw new Error('Pinata JWT is required for IPFS upload. Please set VITE_PINATA_JWT in .env');
  }

  const formData = new FormData();
  formData.append('file', file);

  const metadata = JSON.stringify({
    name: file.name || `curio-nft-asset-${Date.now()}`,
    keyvalues: {
      app: 'curio-nft-marketplace',
      timestamp: Date.now().toString(),
    },
  });
  formData.append('pinataMetadata', metadata);

  const options = JSON.stringify({
    cidVersion: 1,
  });
  formData.append('pinataOptions', options);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file to Pinata IPFS (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const ipfsHash = data.IpfsHash;
  const ipfsUri = `ipfs://${ipfsHash}`;
  const gatewayUrl = `${PINATA_GATEWAY.replace(/\/+$/, '')}/${ipfsHash}`;

  return { ipfsHash, ipfsUri, gatewayUrl };
}

/**
 * Upload JSON metadata to Pinata IPFS.
 */
export async function uploadJSONToPinata(
  content: Record<string, any>,
  jwt: string = DEFAULT_PINATA_JWT,
  name: string = `curio-metadata-${Date.now()}.json`
): Promise<PinataUploadResult> {
  const token = jwt.trim();
  if (!token) {
    throw new Error('Pinata JWT is required for IPFS upload. Please set VITE_PINATA_JWT in .env');
  }

  const payload = {
    pinataContent: content,
    pinataMetadata: {
      name,
      keyvalues: {
        app: 'curio-nft-marketplace',
        type: 'erc721-metadata',
      },
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload metadata to Pinata IPFS (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const ipfsHash = data.IpfsHash;
  const ipfsUri = `ipfs://${ipfsHash}`;
  const gatewayUrl = `${PINATA_GATEWAY.replace(/\/+$/, '')}/${ipfsHash}`;

  return { ipfsHash, ipfsUri, gatewayUrl };
}

/**
 * Complete NFT upload workflow:
 * 1. Uploads image file to Pinata IPFS -> receives image IPFS URI.
 * 2. Assembles ERC-721 metadata JSON including the image IPFS URI.
 * 3. Uploads metadata JSON to Pinata IPFS -> receives tokenURI (metadata IPFS URI).
 */
export async function uploadNFTToPinata(
  imageFile: File,
  metadata: NFTMetadataInput,
  jwt: string = DEFAULT_PINATA_JWT
): Promise<{
  tokenURI: string;
  imageURI: string;
  metadataHash: string;
  imageHash: string;
}> {
  // Step 1: Upload image file
  const imageUpload = await uploadFileToPinata(imageFile, jwt);

  // Step 2: Assemble ERC721 compliant metadata
  const fullMetadata = {
    name: metadata.name.trim() || 'Curio Collectible',
    description: metadata.description.trim() || '',
    image: imageUpload.ipfsUri,
    attributes: metadata.attributes || [],
    external_url: 'https://scan.botchain.ai',
  };

  // Step 3: Upload metadata JSON
  const metadataUpload = await uploadJSONToPinata(
    fullMetadata,
    jwt,
    `${(metadata.name || 'nft').toLowerCase().replace(/\s+/g, '-')}-metadata.json`
  );

  return {
    tokenURI: metadataUpload.ipfsUri,
    imageURI: imageUpload.ipfsUri,
    metadataHash: metadataUpload.ipfsHash,
    imageHash: imageUpload.ipfsHash,
  };
}
