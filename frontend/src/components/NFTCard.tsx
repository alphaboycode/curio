import React, { useState, useEffect } from 'react';
import { formatEther } from 'ethers';
import { ExternalLink, Tag, User, ShieldCheck } from 'lucide-react';
import type { NFTItem, NFTMetadata } from '../contracts/config';
import { resolveIPFS, fetchNFTMetadata, IPFS_GATEWAYS } from '../contracts/config';

interface NFTCardProps {
  item: NFTItem;
  account: string | null;
  currencySymbol: string;
  onBuy?: (item: NFTItem) => void;
  onCancelListing?: (tokenId: bigint) => void;
  onOpenListModal?: (item: NFTItem) => void;
  onOpenUpdatePriceModal?: (item: NFTItem) => void;
  isActionLoading?: boolean;
}

export const NFTCard: React.FC<NFTCardProps> = ({
  item,
  account,
  currencySymbol,
  onBuy,
  onCancelListing,
  onOpenListModal,
  onOpenUpdatePriceModal,
  isActionLoading,
}) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsMetadataLoading(true);
    setImageError(false);
    setImageLoaded(false);
    setGatewayIndex(0);

    fetchNFTMetadata(item.tokenURI)
      .then((data) => {
        if (isMounted) {
          setMetadata(data);
          setIsMetadataLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsMetadataLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [item.tokenURI]);

  const isOwner = account && item.owner.toLowerCase() === account.toLowerCase();
  const isSeller = account && item.seller && item.seller.toLowerCase() === account.toLowerCase();

  // Check if tokenURI directly is an image file
  const isDirectImage = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(item.tokenURI);
  const rawImage = metadata?.image || (isDirectImage ? item.tokenURI : null);

  const displayImage = rawImage && !imageError
    ? resolveIPFS(rawImage, gatewayIndex)
    : 'https://placehold.co/400x400/161b26/a855f7?text=Curio+NFT';

  const displayName = metadata?.name || `Curio NFT #${item.tokenId.toString()}`;
  const displayDesc = metadata?.description;

  const handleImageError = () => {
    // If we have alternative IPFS gateways to try, increment gatewayIndex
    if (rawImage?.startsWith('ipfs://') && gatewayIndex < IPFS_GATEWAYS.length - 1) {
      setGatewayIndex((prev) => prev + 1);
    } else {
      setImageError(true);
      setImageLoaded(true);
    }
  };

  return (
    <div className="bg-gray-900/70 border border-gray-800 hover:border-purple-500/40 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 group flex flex-col backdrop-blur-sm">
      {/* Media Container */}
      <div className="relative aspect-square overflow-hidden bg-gray-950 flex items-center justify-center">
        {/* Loading Skeleton */}
        {(isMetadataLoading || (!imageLoaded && !imageError && rawImage)) && (
          <div className="absolute inset-0 bg-gray-900/90 animate-pulse flex flex-col items-center justify-center p-4 z-10">
            <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin mb-2" />
            <span className="text-[11px] text-gray-400 font-medium">
              {isMetadataLoading ? 'Resolving IPFS Metadata...' : 'Loading IPFS Artwork...'}
            </span>
          </div>
        )}

        {rawImage ? (
          <img
            key={`${rawImage}-${gatewayIndex}`}
            src={displayImage}
            alt={displayName}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : !isMetadataLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 p-6 text-center">
            <span className="text-3xl mb-2">💎</span>
            <span className="text-xs text-gray-400 font-medium">{displayName}</span>
          </div>
        ) : null}

        {/* Token ID Badge */}
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/30 shadow-md z-20">
          #{item.tokenId.toString()}
        </div>

        {/* Listed Badge */}
        {item.isListed && (
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-purple-600/90 backdrop-blur-md rounded-lg text-xs font-semibold text-white shadow-md flex items-center space-x-1 z-20">
            <Tag className="w-3 h-3" />
            <span>Listed</span>
          </div>
        )}
      </div>

      {/* Details Container */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Title & Verified */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-base truncate group-hover:text-purple-300 transition-colors" title={displayName}>
              {displayName}
            </h3>
            <span title="Verified on Botchain">
              <ShieldCheck className="w-4 h-4 text-purple-400 flex-shrink-0 ml-1" />
            </span>
          </div>

          {/* Description */}
          {displayDesc ? (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2" title={displayDesc}>
              {displayDesc}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1 italic">Indexer-less on-chain NFT</p>
          )}

          {/* IPFS tokenURI link */}
          <div className="mt-2.5 pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
            <span className="text-gray-500">Metadata:</span>
            <a
              href={resolveIPFS(item.tokenURI)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 flex items-center space-x-1 font-mono truncate max-w-[160px]"
              title={item.tokenURI}
            >
              <span className="truncate">{item.tokenURI.replace('ipfs://', 'ipfs: ')}</span>
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </a>
          </div>

          {/* Seller / Owner info */}
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
            <span className="text-gray-500 flex items-center space-x-1">
              <User className="w-3 h-3" />
              <span>{item.isListed ? 'Seller' : 'Owner'}:</span>
            </span>
            <a
              href={`https://scan.bohr.life/address/${item.isListed ? item.seller : item.owner}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-gray-300 hover:text-purple-300 transition"
              title={item.isListed ? item.seller : item.owner}
            >
              {(item.isListed ? item.seller : item.owner).slice(0, 6)}...
              {(item.isListed ? item.seller : item.owner).slice(-4)}
            </a>
          </div>

          {/* Price (if listed) */}
          {item.isListed && (
            <div className="mt-3 p-2.5 bg-purple-950/30 border border-purple-500/20 rounded-xl flex items-center justify-between">
              <span className="text-xs text-purple-300 font-medium">Price</span>
              <div className="text-right">
                <span className="text-base font-bold text-white font-mono">
                  {formatEther(item.price)}
                </span>
                <span className="ml-1 text-xs font-semibold text-purple-400">{currencySymbol}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-3 border-t border-gray-800/80">
          {item.isListed ? (
            isSeller ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenUpdatePriceModal?.(item)}
                  disabled={isActionLoading}
                  className="bg-gray-800 hover:bg-gray-700 text-purple-300 border border-purple-500/30 text-xs font-semibold py-2 rounded-xl transition cursor-pointer"
                >
                  Edit Price
                </button>
                <button
                  type="button"
                  onClick={() => onCancelListing?.(item.tokenId)}
                  disabled={isActionLoading}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold py-2 rounded-xl transition cursor-pointer"
                >
                  Delist
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onBuy?.(item)}
                disabled={isActionLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm py-2.5 rounded-xl shadow-lg shadow-purple-600/25 transition cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Buy for {formatEther(item.price)} {currencySymbol}</span>
              </button>
            )
          ) : isOwner ? (
            <button
              type="button"
              onClick={() => onOpenListModal?.(item)}
              disabled={isActionLoading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm py-2.5 rounded-xl shadow-md transition cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>List for Sale</span>
            </button>
          ) : (
            <div className="text-center py-2 text-xs text-gray-500 italic bg-gray-950/40 rounded-xl">
              Not for sale
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
