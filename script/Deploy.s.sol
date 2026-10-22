// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/CurioNFTMarketplace.sol";

contract DeployCurioNFTMarketplace is Script {
    function run() external returns (CurioNFTMarketplace) {
        vm.startBroadcast();

        CurioNFTMarketplace marketplace = new CurioNFTMarketplace();

        vm.stopBroadcast();

        console.log("CurioNFTMarketplace deployed at:", address(marketplace));
        return marketplace;
    }
}
