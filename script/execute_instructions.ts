import { ethers } from '../frontend/node_modules/ethers';
import abiJson from '../frontend/src/contracts/CurioNFTMarketplaceAbi.json';

const RPC_URL = process.env.VITE_RPC_URL || 'https://rpc.botchain.ai';
const CONTRACT_ADDRESS = process.env.VITE_CURIO_CONTRACT_ADDRESS || '0x37972DCed63F6bB8356AE002DE75FEB2b37dAB9D';

const WALLET_CONFIGS = [
  {
    name: 'Wallet 1',
    address: '0xbab4e21897330c341161Ca7b881e2c9ffCac0BF2',
    privateKey: '489eee3c04865570094971d66495f91141d91e1f2c960550183800d87e0c8ebf',
    nftName: 'Fox Spirit',
    tokenURI: 'ipfs://QmcQaqR1RpPkaPY67WngPwZPe8t8WCmUfJxypmDqQc5XNR',
  },
  {
    name: 'Wallet 2',
    address: '0x8Ff521632bce1F54F2DA35a71fEfEa5c368f5d8f',
    privateKey: 'a73fae1dcabf4b5dc260148cfb2affa9c87a1bf5a07c00b9c5a63599d6c0050b',
    nftName: 'Crystal Golem',
    tokenURI: 'ipfs://QmNTJrHqyhQFrezJ74eJrR2dSZarX1wfSocoLadYktk3DA',
  },
  {
    name: 'Wallet 3',
    address: '0xDFa20435760c4E2B966415D310B1cC4eEd5D1743',
    privateKey: '95c298110017a3166c79c4cea885e5d89d835522b4acedbb8ed5c3c702fc75dc',
    nftName: 'Punk Skull',
    tokenURI: 'ipfs://QmbL2zsGwCgnENzsHGeRaXJjb4jHjXJUkmNXPRNnWgVuaH',
  },
];

const LIST_PRICE = ethers.parseEther('0.001'); // 0.001 BOT (conserving balance)

async function main() {
  console.log('--- Starting Instruction Execution on Botchain Mainnet ---');
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Initialize wallets
  const wallets = WALLET_CONFIGS.map((cfg) => {
    const signer = new ethers.Wallet(cfg.privateKey, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson, signer);
    return { ...cfg, signer, contract };
  });

  // Verify wallet balances
  for (const w of wallets) {
    const bal = await provider.getBalance(w.address);
    console.log(`${w.name} (${w.address}): ${ethers.formatEther(bal)} BOT`);
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n) / 100n : ethers.parseUnits('25', 'gwei');
  console.log(`Using gasPrice: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);

  // Track minted token IDs per wallet
  const mintedIds: Record<string, bigint[]> = {
    'Wallet 1': [],
    'Wallet 2': [],
    'Wallet 3': [],
  };

  // Helper for transaction execution
  async function executeTx(description: string, fn: () => Promise<ethers.TransactionResponse>) {
    console.log(`\n⏳ ${description}...`);
    const tx = await fn();
    console.log(`   Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed: ${tx.hash}`);
    }
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    return receipt;
  }

  // -------------------------------------------------------------
  // PHASE 1: MINT 5 NFTS FOR EACH WALLET
  // -------------------------------------------------------------
  console.log('\n========================================');
  console.log(' PHASE 1: MINTING 5 NFTS PER WALLET');
  console.log('========================================');

  for (const w of wallets) {
    console.log(`\n>>> Minting 5 NFTs for ${w.name} (${w.nftName})...`);
    for (let i = 1; i <= 5; i++) {
      const receipt = await executeTx(
        `${w.name} minting ${w.nftName} (#${i}/5)`,
        () => w.contract.mintNFT(w.tokenURI, { gasPrice, gasLimit: 250000 })
      );

      // Parse NFTMinted event
      let mintedTokenId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = w.contract.interface.parseLog(log);
          if (parsed && parsed.name === 'NFTMinted') {
            mintedTokenId = parsed.args.tokenId;
            break;
          }
        } catch {}
      }

      if (mintedTokenId === null) {
        throw new Error(`Could not parse NFTMinted event from receipt`);
      }

      console.log(`   Minted Token ID: ${mintedTokenId.toString()}`);
      mintedIds[w.name].push(mintedTokenId);
    }
  }

  console.log('\nMinting complete! Summary:');
  console.log('Wallet 1 minted IDs:', mintedIds['Wallet 1'].map((id) => id.toString()));
  console.log('Wallet 2 minted IDs:', mintedIds['Wallet 2'].map((id) => id.toString()));
  console.log('Wallet 3 minted IDs:', mintedIds['Wallet 3'].map((id) => id.toString()));

  // -------------------------------------------------------------
  // PHASE 2: LIST 2 NFTS FOR EACH WALLET
  // -------------------------------------------------------------
  console.log('\n========================================');
  console.log(' PHASE 2: LISTING 2 NFTS PER WALLET');
  console.log('========================================');

  const listedIds: Record<string, bigint[]> = {
    'Wallet 1': [mintedIds['Wallet 1'][0], mintedIds['Wallet 1'][1]],
    'Wallet 2': [mintedIds['Wallet 2'][0], mintedIds['Wallet 2'][1]],
    'Wallet 3': [mintedIds['Wallet 3'][0], mintedIds['Wallet 3'][1]],
  };

  for (const w of wallets) {
    const tokensToList = listedIds[w.name];
    console.log(`\n>>> ${w.name} listing tokens ${tokensToList.map((t) => t.toString()).join(', ')}...`);
    for (const tid of tokensToList) {
      await executeTx(
        `${w.name} listing Token #${tid} for ${ethers.formatEther(LIST_PRICE)} BOT`,
        () => w.contract.listNFT(tid, LIST_PRICE, { gasPrice, gasLimit: 200000 })
      );
    }
  }

  // -------------------------------------------------------------
  // PHASE 3: BUY 2 NFTS FROM MARKETPLACE FOR EACH WALLET
  // -------------------------------------------------------------
  console.log('\n========================================');
  console.log(' PHASE 3: BUYING 2 NFTS PER WALLET');
  console.log('========================================');

  // W1 buys: listedIds['Wallet 2'][0] and listedIds['Wallet 3'][0]
  // W2 buys: listedIds['Wallet 1'][0] and listedIds['Wallet 3'][1]
  // W3 buys: listedIds['Wallet 1'][1] and listedIds['Wallet 2'][1]

  const purchases = [
    {
      buyer: wallets[0],
      tokensToBuy: [listedIds['Wallet 2'][0], listedIds['Wallet 3'][0]],
      sellers: ['Wallet 2', 'Wallet 3'],
    },
    {
      buyer: wallets[1],
      tokensToBuy: [listedIds['Wallet 1'][0], listedIds['Wallet 3'][1]],
      sellers: ['Wallet 1', 'Wallet 3'],
    },
    {
      buyer: wallets[2],
      tokensToBuy: [listedIds['Wallet 1'][1], listedIds['Wallet 2'][1]],
      sellers: ['Wallet 1', 'Wallet 2'],
    },
  ];

  for (const p of purchases) {
    console.log(`\n>>> ${p.buyer.name} buying 2 NFTs from marketplace...`);
    for (let i = 0; i < p.tokensToBuy.length; i++) {
      const tid = p.tokensToBuy[i];
      const from = p.sellers[i];
      await executeTx(
        `${p.buyer.name} buying Token #${tid} (listed by ${from}) for ${ethers.formatEther(LIST_PRICE)} BOT`,
        () => p.buyer.contract.buyNFT(tid, { value: LIST_PRICE, gasPrice, gasLimit: 250000 })
      );
    }
  }

  // -------------------------------------------------------------
  // FINAL VERIFICATION & REPORT
  // -------------------------------------------------------------
  console.log('\n========================================');
  console.log(' FINAL VERIFICATION & REPORT');
  console.log('========================================');

  const readContract = new ethers.Contract(CONTRACT_ADDRESS, abiJson, provider);
  const total = await readContract.totalMinted();
  console.log(`Total NFTs minted on contract: ${total.toString()}`);

  for (const w of wallets) {
    const bal = await provider.getBalance(w.address);
    const nfts = await readContract.getUserNFTs(w.address);
    console.log(`\n${w.name} (${w.address}):`);
    console.log(`  Balance: ${ethers.formatEther(bal)} BOT`);
    console.log(`  Total NFTs Owned: ${nfts.length}`);
    for (const item of nfts) {
      console.log(`    - Token #${item.tokenId}: listed=${item.isListed}, tokenURI=${item.tokenURI}`);
    }
  }

  const active = await readContract.getAllActiveListings();
  console.log(`\nActive listings remaining on marketplace: ${active.length}`);
  for (const a of active) {
    console.log(`  - Token #${a.tokenId}: seller=${a.seller}, price=${ethers.formatEther(a.price)} BOT`);
  }

  console.log('\n🎉 ALL INSTRUCTIONS COMPLETED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('\n❌ Execution failed:', err);
  process.exit(1);
});
