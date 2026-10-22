// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CurioNFTMarketplace.sol";

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract RejectEtherMinter is IERC721Receiver {
    CurioNFTMarketplace public marketplace;

    constructor(address _marketplace) {
        marketplace = CurioNFTMarketplace(_marketplace);
    }

    function mint(string calldata uri) external returns (uint256) {
        return marketplace.mintNFT(uri);
    }

    function list(uint256 tokenId, uint256 price) external {
        marketplace.listNFT(tokenId, price);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    // No receive or fallback: rejects incoming ether payments
}

contract ReentrancyAttacker {
    CurioNFTMarketplace public marketplace;
    uint256 public targetTokenId;
    bool public hasAttacked;

    constructor(address _marketplace) {
        marketplace = CurioNFTMarketplace(_marketplace);
    }

    function attack(uint256 _targetTokenId) external payable {
        targetTokenId = _targetTokenId;
        hasAttacked = false;
        marketplace.buyNFT{value: msg.value}(targetTokenId);
    }

    receive() external payable {
        if (!hasAttacked) {
            hasAttacked = true;
            // Attempt to re-enter buyNFT
            marketplace.buyNFT{value: msg.value}(targetTokenId);
        }
    }
}

contract CurioNFTMarketplaceTest is Test {
    CurioNFTMarketplace public marketplace;

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xCAFE);

    string constant TOKEN_URI_1 = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string constant TOKEN_URI_2 = "ipfs://bafybeihkoviema7g3gxyt6la7vd5ho32znq2zkj2n34qqzoxz7v2q67npi";
    string constant TOKEN_URI_3 = "ipfs://bafybeigbdqq3n66pkq65vyv4omfq3q7xwtm6z5w7y63a5h4g6eoxq7j2la";

    function setUp() public {
        marketplace = new CurioNFTMarketplace();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // =========================================================================
    // Minting Tests
    // =========================================================================

    function test_MintNFT_Success() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        assertEq(tokenId, 1);
        assertEq(marketplace.ownerOf(tokenId), alice);
        assertEq(marketplace.tokenURI(tokenId), TOKEN_URI_1);
        assertEq(marketplace.totalMinted(), 1);
        assertEq(marketplace.getUserNFTCount(alice), 1);
        assertEq(marketplace.balanceOf(alice), 1);

        CurioNFTMarketplace.NFTItem[] memory aliceNFTs = marketplace.getUserNFTs(alice);
        assertEq(aliceNFTs.length, 1);
        assertEq(aliceNFTs[0].tokenId, 1);
        assertEq(aliceNFTs[0].tokenURI, TOKEN_URI_1);
        assertEq(aliceNFTs[0].owner, alice);
        assertEq(aliceNFTs[0].isListed, false);
        assertEq(aliceNFTs[0].price, 0);
    }

    function test_MintNFT_MultipleTokens() public {
        vm.startPrank(alice);
        uint256 id1 = marketplace.mintNFT(TOKEN_URI_1);
        uint256 id2 = marketplace.mintNFT(TOKEN_URI_2);
        vm.stopPrank();

        vm.prank(bob);
        uint256 id3 = marketplace.mintNFT(TOKEN_URI_3);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(marketplace.totalMinted(), 3);

        assertEq(marketplace.getUserNFTCount(alice), 2);
        assertEq(marketplace.getUserNFTCount(bob), 1);

        uint256[] memory aliceIds = marketplace.getUserTokenIds(alice);
        assertEq(aliceIds.length, 2);
        assertEq(aliceIds[0], 1);
        assertEq(aliceIds[1], 2);
    }

    function test_MintNFT_RevertOnEmptyURI() public {
        vm.prank(alice);
        vm.expectRevert(CurioNFTMarketplace.Curio__EmptyTokenURI.selector);
        marketplace.mintNFT("");
    }

    // =========================================================================
    // Listing Tests
    // =========================================================================

    function test_ListNFT_Success() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        uint256 price = 1.5 ether;
        vm.prank(alice);
        marketplace.listNFT(tokenId, price);

        (uint256 listedId, address payable seller, uint256 listedPrice, bool isListed) = marketplace.listings(tokenId);
        assertEq(listedId, tokenId);
        assertEq(seller, alice);
        assertEq(listedPrice, price);
        assertTrue(isListed);

        assertEq(marketplace.getActiveListingCount(), 1);

        CurioNFTMarketplace.NFTItem[] memory activeListings = marketplace.getAllActiveListings();
        assertEq(activeListings.length, 1);
        assertEq(activeListings[0].tokenId, tokenId);
        assertEq(activeListings[0].price, price);
        assertEq(activeListings[0].seller, alice);
        assertTrue(activeListings[0].isListed);

        // Check user NFT details reflect listing status
        CurioNFTMarketplace.NFTItem[] memory aliceNFTs = marketplace.getUserNFTs(alice);
        assertEq(aliceNFTs.length, 1);
        assertTrue(aliceNFTs[0].isListed);
        assertEq(aliceNFTs[0].price, price);
    }

    function test_ListNFT_RevertIfNotOwner() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(bob);
        vm.expectRevert(CurioNFTMarketplace.Curio__NotTokenOwner.selector);
        marketplace.listNFT(tokenId, 1 ether);
    }

    function test_ListNFT_RevertIfZeroPrice() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(alice);
        vm.expectRevert(CurioNFTMarketplace.Curio__PriceMustBeGreaterThanZero.selector);
        marketplace.listNFT(tokenId, 0);
    }

    function test_ListNFT_RevertIfAlreadyListed() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        vm.expectRevert(CurioNFTMarketplace.Curio__AlreadyListed.selector);
        marketplace.listNFT(tokenId, 2 ether);
        vm.stopPrank();
    }

    function test_TransferLockedWhileListed() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        // Attempt direct ERC721 transfer while listed
        vm.expectRevert(CurioNFTMarketplace.Curio__TokenLockedInListing.selector);
        marketplace.transferFrom(alice, bob, tokenId);
        vm.stopPrank();
    }

    // =========================================================================
    // Buying Tests
    // =========================================================================

    function test_BuyNFT_Success_ExactPayment() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        uint256 price = 2 ether;
        vm.prank(alice);
        marketplace.listNFT(tokenId, price);

        uint256 aliceBalBefore = alice.balance;
        uint256 bobBalBefore = bob.balance;

        // Bob buys token from Alice
        vm.prank(bob);
        marketplace.buyNFT{value: price}(tokenId);

        // 1. Check seller received 100% of price (zero fees)
        assertEq(alice.balance, aliceBalBefore + price);
        assertEq(bob.balance, bobBalBefore - price);

        // 2. Check token ownership transferred to buyer
        assertEq(marketplace.ownerOf(tokenId), bob);
        assertEq(marketplace.balanceOf(alice), 0);
        assertEq(marketplace.balanceOf(bob), 1);

        // 3. Check token removed from seller mapping and added to buyer mapping
        assertEq(marketplace.getUserNFTCount(alice), 0);
        assertEq(marketplace.getUserNFTs(alice).length, 0);

        assertEq(marketplace.getUserNFTCount(bob), 1);
        CurioNFTMarketplace.NFTItem[] memory bobNFTs = marketplace.getUserNFTs(bob);
        assertEq(bobNFTs.length, 1);
        assertEq(bobNFTs[0].tokenId, tokenId);
        assertEq(bobNFTs[0].owner, bob);
        assertFalse(bobNFTs[0].isListed);

        // 4. Check listing status deactivated and active listings array empty
        (, , , bool isListed) = marketplace.listings(tokenId);
        assertFalse(isListed);
        assertEq(marketplace.getActiveListingCount(), 0);
        assertEq(marketplace.getAllActiveListings().length, 0);
    }

    function test_BuyNFT_Success_RefundsExcessPayment() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        uint256 price = 1.2 ether;
        vm.prank(alice);
        marketplace.listNFT(tokenId, price);

        uint256 aliceBalBefore = alice.balance;
        uint256 bobBalBefore = bob.balance;

        // Bob pays 3 ether for a 1.2 ether listing
        vm.prank(bob);
        marketplace.buyNFT{value: 3 ether}(tokenId);

        // Alice receives exactly 1.2 ether
        assertEq(alice.balance, aliceBalBefore + 1.2 ether);
        // Bob only spent 1.2 ether net (1.8 ether refunded)
        assertEq(bob.balance, bobBalBefore - 1.2 ether);

        // Ownership updated
        assertEq(marketplace.ownerOf(tokenId), bob);
    }

    function test_BuyNFT_RevertIfInsufficientPayment() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        uint256 price = 2 ether;
        vm.prank(alice);
        marketplace.listNFT(tokenId, price);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CurioNFTMarketplace.Curio__InsufficientPayment.selector, price, 1 ether));
        marketplace.buyNFT{value: 1 ether}(tokenId);
    }

    function test_BuyNFT_RevertIfBuyerIsSeller() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        vm.expectRevert(CurioNFTMarketplace.Curio__CannotBuyOwnNFT.selector);
        marketplace.buyNFT{value: 1 ether}(tokenId);
        vm.stopPrank();
    }

    function test_BuyNFT_RevertIfNotListed() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(bob);
        vm.expectRevert(CurioNFTMarketplace.Curio__NotListed.selector);
        marketplace.buyNFT{value: 1 ether}(tokenId);
    }

    function test_BuyNFT_RevertIfSellerRejectsPayment() public {
        RejectEtherMinter rejectContract = new RejectEtherMinter(address(marketplace));
        uint256 tokenId = rejectContract.mint(TOKEN_URI_1);
        rejectContract.list(tokenId, 1 ether);

        vm.prank(bob);
        vm.expectRevert(CurioNFTMarketplace.Curio__PaymentTransferFailed.selector);
        marketplace.buyNFT{value: 1 ether}(tokenId);
    }

    // =========================================================================
    // Cancellation & Price Update Tests
    // =========================================================================

    function test_CancelListing_Success() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        assertEq(marketplace.getActiveListingCount(), 1);

        marketplace.cancelListing(tokenId);
        vm.stopPrank();

        (, , , bool isListed) = marketplace.listings(tokenId);
        assertFalse(isListed);
        assertEq(marketplace.getActiveListingCount(), 0);

        // Token can now be normally transferred directly by Alice since it's no longer listed
        vm.prank(alice);
        marketplace.transferFrom(alice, bob, tokenId);
        assertEq(marketplace.ownerOf(tokenId), bob);
    }

    function test_CancelListing_RevertIfNotSeller() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(alice);
        marketplace.listNFT(tokenId, 1 ether);

        vm.prank(bob);
        vm.expectRevert(CurioNFTMarketplace.Curio__NotTokenOwner.selector);
        marketplace.cancelListing(tokenId);
    }

    function test_CancelListing_RevertIfNotListed() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(alice);
        vm.expectRevert(CurioNFTMarketplace.Curio__NotListed.selector);
        marketplace.cancelListing(tokenId);
    }

    function test_UpdateListingPrice_Success() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        marketplace.updateListingPrice(tokenId, 3.5 ether);
        vm.stopPrank();

        (, , uint256 price, ) = marketplace.listings(tokenId);
        assertEq(price, 3.5 ether);

        CurioNFTMarketplace.NFTItem[] memory activeListings = marketplace.getAllActiveListings();
        assertEq(activeListings[0].price, 3.5 ether);
    }

    function test_UpdateListingPrice_RevertIfZero() public {
        vm.startPrank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);
        marketplace.listNFT(tokenId, 1 ether);

        vm.expectRevert(CurioNFTMarketplace.Curio__PriceMustBeGreaterThanZero.selector);
        marketplace.updateListingPrice(tokenId, 0);
        vm.stopPrank();
    }

    function test_UpdateListingPrice_RevertIfNotSeller() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        vm.prank(alice);
        marketplace.listNFT(tokenId, 1 ether);

        vm.prank(bob);
        vm.expectRevert(CurioNFTMarketplace.Curio__NotTokenOwner.selector);
        marketplace.updateListingPrice(tokenId, 2 ether);
    }

    // =========================================================================
    // Complex Indexer-less Swap & Pop Mappings Tests
    // =========================================================================

    function test_UserMappingSwapAndPopIntegrity() public {
        // Alice mints 3 tokens: [1, 2, 3]
        vm.startPrank(alice);
        marketplace.mintNFT(TOKEN_URI_1); // 1
        marketplace.mintNFT(TOKEN_URI_2); // 2
        marketplace.mintNFT(TOKEN_URI_3); // 3

        marketplace.listNFT(1, 1 ether);
        marketplace.listNFT(2, 2 ether);
        marketplace.listNFT(3, 3 ether);
        vm.stopPrank();

        assertEq(marketplace.getActiveListingCount(), 3);

        // Bob buys middle token (tokenId = 2)
        vm.prank(bob);
        marketplace.buyNFT{value: 2 ether}(2);

        // Check active listings remaining: should have 2 items (1 and 3)
        assertEq(marketplace.getActiveListingCount(), 2);
        CurioNFTMarketplace.NFTItem[] memory remainingListings = marketplace.getAllActiveListings();
        assertEq(remainingListings.length, 2);

        // Check Alice's tokens remaining: [1, 3]
        uint256[] memory aliceRemaining = marketplace.getUserTokenIds(alice);
        assertEq(aliceRemaining.length, 2);

        // Check Bob's tokens: [2]
        uint256[] memory bobTokens = marketplace.getUserTokenIds(bob);
        assertEq(bobTokens.length, 1);
        assertEq(bobTokens[0], 2);

        // Charlie buys the first token (tokenId = 1)
        vm.prank(charlie);
        marketplace.buyNFT{value: 1 ether}(1);

        // Alice has only [3] left
        assertEq(marketplace.getUserNFTCount(alice), 1);
        assertEq(marketplace.getUserTokenIds(alice)[0], 3);

        // Bob buys the last token (tokenId = 3)
        vm.prank(bob);
        marketplace.buyNFT{value: 3 ether}(3);

        // Alice has 0 tokens left
        assertEq(marketplace.getUserNFTCount(alice), 0);
        assertEq(marketplace.getUserTokenIds(alice).length, 0);

        // Bob now has [2, 3]
        assertEq(marketplace.getUserNFTCount(bob), 2);

        // No active listings remaining
        assertEq(marketplace.getActiveListingCount(), 0);
    }

    // =========================================================================
    // View Functions Tests
    // =========================================================================

    function test_GetNFTDetails() public {
        vm.prank(alice);
        uint256 tokenId = marketplace.mintNFT(TOKEN_URI_1);

        CurioNFTMarketplace.NFTItem memory item = marketplace.getNFTDetails(tokenId);
        assertEq(item.tokenId, tokenId);
        assertEq(item.tokenURI, TOKEN_URI_1);
        assertEq(item.owner, alice);
        assertFalse(item.isListed);
        assertEq(item.price, 0);

        vm.prank(alice);
        marketplace.listNFT(tokenId, 2.5 ether);

        item = marketplace.getNFTDetails(tokenId);
        assertTrue(item.isListed);
        assertEq(item.seller, alice);
        assertEq(item.price, 2.5 ether);
    }
}
