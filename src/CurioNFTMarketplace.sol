// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CurioNFTMarketplace
 * @notice All-in-one indexer-less NFT collection and marketplace contract.
 * @dev Enables minting, direct listing, purchasing with native tokens, and cancellation
 *      without requiring any off-chain indexing services (The Graph, subgraphs, or centralized databases).
 */
contract CurioNFTMarketplace is ERC721URIStorage, ReentrancyGuard {
    // ------------------------------------------------------------------------
    // Structs
    // ------------------------------------------------------------------------

    struct Listing {
        uint256 tokenId;
        address payable seller;
        uint256 price;
        bool isListed;
    }

    struct NFTItem {
        uint256 tokenId;
        string tokenURI;
        address owner;
        address seller;
        uint256 price;
        bool isListed;
    }

    // ------------------------------------------------------------------------
    // State Variables
    // ------------------------------------------------------------------------

    uint256 private _nextTokenId = 1;

    // Mapping from tokenId to its market Listing details
    mapping(uint256 => Listing) public listings;

    // User owned tokens tracking for indexer-less queries
    // user address => array of owned tokenIds
    mapping(address => uint256[]) private _userTokens;
    // tokenId => index in _userTokens[owner]
    mapping(uint256 => uint256) private _userTokenIndex;

    // Active listings tracking for indexer-less marketplace queries
    uint256[] private _activeListingTokenIds;
    // tokenId => index in _activeListingTokenIds
    mapping(uint256 => uint256) private _activeListingIndex;

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    event NFTMinted(uint256 indexed tokenId, address indexed minter, string tokenURI);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event ListingCanceled(uint256 indexed tokenId, address indexed seller);
    event ListingPriceUpdated(uint256 indexed tokenId, address indexed seller, uint256 newPrice);

    // ------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------

    error Curio__EmptyTokenURI();
    error Curio__NotTokenOwner();
    error Curio__PriceMustBeGreaterThanZero();
    error Curio__AlreadyListed();
    error Curio__NotListed();
    error Curio__InsufficientPayment(uint256 requiredPrice, uint256 sentAmount);
    error Curio__CannotBuyOwnNFT();
    error Curio__PaymentTransferFailed();
    error Curio__RefundTransferFailed();
    error Curio__TokenLockedInListing();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    constructor() ERC721("Curio NFT", "CURIO") {}

    // ------------------------------------------------------------------------
    // Core Functions: Minting
    // ------------------------------------------------------------------------

    /**
     * @notice Mint a new Curio NFT by providing the metadata tokenURI.
     * @param _tokenURI The metadata URI (e.g. IPFS link or HTTP URL)
     * @return tokenId The ID of the newly minted token
     */
    function mintNFT(string calldata _tokenURI) external nonReentrant returns (uint256) {
        if (bytes(_tokenURI).length == 0) {
            revert Curio__EmptyTokenURI();
        }

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _setTokenURI(tokenId, _tokenURI);
        emit NFTMinted(tokenId, msg.sender, _tokenURI);

        _safeMint(msg.sender, tokenId);

        return tokenId;
    }

    // ------------------------------------------------------------------------
    // Core Functions: Listing & Marketplace
    // ------------------------------------------------------------------------

    /**
     * @notice List an owned NFT on the marketplace with a native token price.
     * @dev No platform fees are charged. 100% of the sale goes to the seller.
     * @param tokenId The ID of the token to list
     * @param price The listing price in wei (native currency)
     */
    function listNFT(uint256 tokenId, uint256 price) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) {
            revert Curio__NotTokenOwner();
        }
        if (price == 0) {
            revert Curio__PriceMustBeGreaterThanZero();
        }
        if (listings[tokenId].isListed) {
            revert Curio__AlreadyListed();
        }

        listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: payable(msg.sender),
            price: price,
            isListed: true
        });

        _activeListingIndex[tokenId] = _activeListingTokenIds.length;
        _activeListingTokenIds.push(tokenId);

        emit NFTListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Buy a listed NFT by paying the required native token price.
     * @dev Removes the NFT from the seller's mapping and adds it to the buyer's mapping.
     *      Sends 100% of the sale proceeds to the seller without any platform fees.
     * @param tokenId The ID of the listed token to purchase
     */
    function buyNFT(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = listings[tokenId];

        if (!listing.isListed) {
            revert Curio__NotListed();
        }
        if (msg.sender == listing.seller) {
            revert Curio__CannotBuyOwnNFT();
        }
        if (msg.value < listing.price) {
            revert Curio__InsufficientPayment(listing.price, msg.value);
        }

        // De-list before transfer to allow ERC721 transfer and prevent reentrancy
        listings[tokenId].isListed = false;
        _removeActiveListing(tokenId);

        address payable seller = listing.seller;
        uint256 price = listing.price;
        uint256 excess = msg.value - price;

        // Transfer token ownership: seller -> buyer (msg.sender)
        // This triggers _update() which removes the token from the seller's mapping
        // and adds it to the buyer's mapping.
        _transfer(seller, msg.sender, tokenId);

        // Emit event before external interactions (CEI pattern)
        emit NFTSold(tokenId, seller, msg.sender, price);

        // Send 100% of price to the seller (No fees)
        (bool paymentSuccess, ) = seller.call{value: price}("");
        if (!paymentSuccess) {
            revert Curio__PaymentTransferFailed();
        }

        // Refund any excess native tokens sent by buyer
        if (excess > 0) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            if (!refundSuccess) {
                revert Curio__RefundTransferFailed();
            }
        }
    }

    /**
     * @notice Cancel an active listing.
     * @param tokenId The token ID to delist
     */
    function cancelListing(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];

        if (!listing.isListed) {
            revert Curio__NotListed();
        }
        if (listing.seller != msg.sender) {
            revert Curio__NotTokenOwner();
        }

        listings[tokenId].isListed = false;
        _removeActiveListing(tokenId);

        emit ListingCanceled(tokenId, msg.sender);
    }

    /**
     * @notice Update the price of an active listing.
     * @param tokenId The token ID of the active listing
     * @param newPrice The updated price in wei
     */
    function updateListingPrice(uint256 tokenId, uint256 newPrice) external nonReentrant {
        Listing storage listing = listings[tokenId];

        if (!listing.isListed) {
            revert Curio__NotListed();
        }
        if (listing.seller != msg.sender) {
            revert Curio__NotTokenOwner();
        }
        if (newPrice == 0) {
            revert Curio__PriceMustBeGreaterThanZero();
        }

        listing.price = newPrice;
        emit ListingPriceUpdated(tokenId, msg.sender, newPrice);
    }

    // ------------------------------------------------------------------------
    // Internal Enumeration & Hook Overrides
    // ------------------------------------------------------------------------

    /**
     * @dev Overrides ERC721 _update hook to maintain user token lists automatically.
     *      Also ensures that an actively listed token cannot be transferred directly
     *      without canceling the listing first (protecting marketplace integrity).
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = super._update(to, tokenId, auth);

        // If actively listed, direct transfer is locked (delist or buy first)
        if (from != address(0) && to != address(0) && listings[tokenId].isListed) {
            revert Curio__TokenLockedInListing();
        }

        // Delete from previous owner mapping
        if (from != address(0)) {
            _removeTokenFromUser(from, tokenId);
        }

        // Add to new owner mapping
        if (to != address(0)) {
            _addTokenToUser(to, tokenId);
        }

        return from;
    }

    function _addTokenToUser(address user, uint256 tokenId) private {
        _userTokenIndex[tokenId] = _userTokens[user].length;
        _userTokens[user].push(tokenId);
    }

    function _removeTokenFromUser(address user, uint256 tokenId) private {
        uint256 lastTokenIndex = _userTokens[user].length - 1;
        uint256 tokenIndex = _userTokenIndex[tokenId];

        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _userTokens[user][lastTokenIndex];
            _userTokens[user][tokenIndex] = lastTokenId;
            _userTokenIndex[lastTokenId] = tokenIndex;
        }

        _userTokens[user].pop();
        delete _userTokenIndex[tokenId];
    }

    function _removeActiveListing(uint256 tokenId) private {
        uint256 lastIndex = _activeListingTokenIds.length - 1;
        uint256 index = _activeListingIndex[tokenId];

        if (index != lastIndex) {
            uint256 lastTokenId = _activeListingTokenIds[lastIndex];
            _activeListingTokenIds[index] = lastTokenId;
            _activeListingIndex[lastTokenId] = index;
        }

        _activeListingTokenIds.pop();
        delete _activeListingIndex[tokenId];
    }

    // ------------------------------------------------------------------------
    // Indexer-less View Functions for Frontend DApp
    // ------------------------------------------------------------------------

    /**
     * @notice Get all NFTs currently owned by a user with complete metadata & listing status.
     * @param user The address of the user
     * @return items Array of NFTItem structs owned by the user
     */
    function getUserNFTs(address user) external view returns (NFTItem[] memory) {
        uint256[] memory tokenIds = _userTokens[user];
        uint256 total = tokenIds.length;
        NFTItem[] memory items = new NFTItem[](total);

        for (uint256 i = 0; i < total; i++) {
            uint256 tid = tokenIds[i];
            Listing memory listing = listings[tid];
            items[i] = NFTItem({
                tokenId: tid,
                tokenURI: tokenURI(tid),
                owner: user,
                seller: listing.isListed ? listing.seller : address(0),
                price: listing.isListed ? listing.price : 0,
                isListed: listing.isListed
            });
        }
        return items;
    }

    /**
     * @notice Get all raw token IDs owned by a user.
     * @param user The address of the user
     * @return Array of token IDs
     */
    function getUserTokenIds(address user) external view returns (uint256[] memory) {
        return _userTokens[user];
    }

    /**
     * @notice Get all currently active listings in the marketplace.
     * @return items Array of NFTItem structs representing all active listings
     */
    function getAllActiveListings() external view returns (NFTItem[] memory) {
        uint256 total = _activeListingTokenIds.length;
        NFTItem[] memory items = new NFTItem[](total);

        for (uint256 i = 0; i < total; i++) {
            uint256 tid = _activeListingTokenIds[i];
            Listing memory listing = listings[tid];
            items[i] = NFTItem({
                tokenId: tid,
                tokenURI: tokenURI(tid),
                owner: ownerOf(tid),
                seller: listing.seller,
                price: listing.price,
                isListed: true
            });
        }
        return items;
    }

    /**
     * @notice Get all active listing token IDs.
     * @return Array of actively listed token IDs
     */
    function getActiveListingTokenIds() external view returns (uint256[] memory) {
        return _activeListingTokenIds;
    }

    /**
     * @notice Get detailed information for a specific token ID.
     * @param tokenId The token ID to query
     * @return item Complete NFTItem struct
     */
    function getNFTDetails(uint256 tokenId) external view returns (NFTItem memory) {
        _requireOwned(tokenId);
        Listing memory listing = listings[tokenId];
        return NFTItem({
            tokenId: tokenId,
            tokenURI: tokenURI(tokenId),
            owner: ownerOf(tokenId),
            seller: listing.isListed ? listing.seller : address(0),
            price: listing.isListed ? listing.price : 0,
            isListed: listing.isListed
        });
    }

    /**
     * @notice Returns total number of active listings.
     */
    function getActiveListingCount() external view returns (uint256) {
        return _activeListingTokenIds.length;
    }

    /**
     * @notice Returns total count of NFTs owned by a user.
     */
    function getUserNFTCount(address user) external view returns (uint256) {
        return _userTokens[user].length;
    }

    /**
     * @notice Total number of NFTs minted so far.
     */
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
