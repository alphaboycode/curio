import React, { useState, useEffect } from 'react';
import { BrowserProvider, Contract, formatEther, parseEther } from 'ethers';
import { 
  ShoppingBag, 
  Sparkles, 
  User, 
  Wallet, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  RefreshCw,
  Edit2,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  SlidersHorizontal,
  Info,
  ShieldCheck,
  KeyRound,
  Coins
} from 'lucide-react';
import { 
  CURIO_CONTRACT_ADDRESS, 
  CURIO_ABI, 
  BOTCHAIN_NETWORK_CONFIG, 
  CURRENCY_SYMBOL,
  resolveIPFS,
  getCachedNFTMetadata,
  getReadOnlyProvider,
  getReadOnlyContract
} from './contracts/config';
import type { NFTItem } from './contracts/config';
import { NFTCard } from './components/NFTCard';
import { 
  uploadNFTToPinata, 
  testPinataConnection, 
  DEFAULT_PINATA_JWT 
} from './services/pinata';

export function App() {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'my-nfts' | 'mint' | 'network-info'>('marketplace');
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [contractAddress, setContractAddress] = useState<string>(CURIO_CONTRACT_ADDRESS);
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(false);
  const [tempAddress, setTempAddress] = useState<string>(CURIO_CONTRACT_ADDRESS);

  // Data states
  const [activeListings, setActiveListings] = useState<NFTItem[]>([]);
  const [userNFTs, setUserNFTs] = useState<NFTItem[]>([]);
  const [totalMinted, setTotalMinted] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [txMessage, setTxMessage] = useState<{ 
    type: 'success' | 'error' | 'info'; 
    text: string;
    txHash?: string;
  } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'id-desc' | 'id-asc' | 'price-asc' | 'price-desc'>('id-desc');

  // Mint form state
  const [mintMode, setMintMode] = useState<'pinata' | 'manual'>('pinata');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [nftName, setNftName] = useState<string>('');
  const [nftDescription, setNftDescription] = useState<string>('');
  const [nftAttributes, setNftAttributes] = useState<Array<{ trait_type: string; value: string }>>([
    { trait_type: '', value: '' },
  ]);
  const [manualTokenURI, setManualTokenURI] = useState<string>('');
  const [pinataJwt, setPinataJwt] = useState<string>(DEFAULT_PINATA_JWT);
  const [isJwtValid, setIsJwtValid] = useState<boolean | null>(null);
  const [showJwtModal, setShowJwtModal] = useState<boolean>(false);
  const [mintStep, setMintStep] = useState<
    'idle' | 'uploading-image' | 'uploading-metadata' | 'awaiting-tx' | 'confirming' | 'completed'
  >('idle');
  const [currentMintTokenURI, setCurrentMintTokenURI] = useState<string>('');
  const [lastMintedResult, setLastMintedResult] = useState<{
    tokenId?: string;
    tokenURI?: string;
    imageURI?: string;
    txHash?: string;
  } | null>(null);

  // Listing modal states
  const [selectedTokenForListing, setSelectedTokenForListing] = useState<NFTItem | null>(null);
  const [listingPrice, setListingPrice] = useState<string>('');
  const [selectedTokenForPriceUpdate, setSelectedTokenForPriceUpdate] = useState<NFTItem | null>(null);
  const [newPriceInput, setNewPriceInput] = useState<string>('');

  // Check Pinata JWT on mount
  useEffect(() => {
    if (pinataJwt) {
      testPinataConnection(pinataJwt).then((valid) => setIsJwtValid(valid));
    } else {
      setIsJwtValid(false);
    }
  }, [pinataJwt]);

  // Network Switcher
  const switchToBotchain = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setTxMessage({ type: 'error', text: 'MetaMask or Web3 wallet not detected!' });
      return;
    }
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BOTCHAIN_NETWORK_CONFIG.chainIdHex }],
      });
      setTxMessage({ type: 'success', text: `Switched to ${BOTCHAIN_NETWORK_CONFIG.chainName}` });
    } catch (switchError: any) {
      // Error code 4902 indicates chain has not been added yet
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: BOTCHAIN_NETWORK_CONFIG.chainIdHex,
                chainName: BOTCHAIN_NETWORK_CONFIG.chainName,
                rpcUrls: BOTCHAIN_NETWORK_CONFIG.rpcUrls,
                nativeCurrency: BOTCHAIN_NETWORK_CONFIG.nativeCurrency,
                blockExplorerUrls: BOTCHAIN_NETWORK_CONFIG.blockExplorerUrls,
              },
            ],
          });
          setTxMessage({ type: 'success', text: `Added and switched to ${BOTCHAIN_NETWORK_CONFIG.chainName}` });
        } catch (addError: any) {
          setTxMessage({ type: 'error', text: addError.message || 'Failed to add network' });
        }
      } else {
        setTxMessage({ type: 'error', text: switchError.message || 'Failed to switch network' });
      }
    }
  };

  // Connect Web3 Wallet
  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const browserProvider = new BrowserProvider((window as any).ethereum);
        const accounts = await browserProvider.send('eth_requestAccounts', []);
        const network = await browserProvider.getNetwork();
        const currentChainId = Number(network.chainId);

        setProvider(browserProvider);
        setChainId(currentChainId);

        if (accounts.length > 0) {
          const userAccount = accounts[0];
          setAccount(userAccount);

          // Get wallet balance on Botchain
          try {
            const botchainProvider = getReadOnlyProvider();
            const balance = await botchainProvider.getBalance(userAccount);
            setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
          } catch {
            const balance = await browserProvider.getBalance(userAccount);
            setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
          }

          setTxMessage({
            type: 'success',
            text: `Connected: ${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`,
          });

          // Check network
          if (currentChainId !== BOTCHAIN_NETWORK_CONFIG.chainId) {
            setTxMessage({
              type: 'info',
              text: `Connected to chain ${currentChainId}. Please switch to ${BOTCHAIN_NETWORK_CONFIG.chainName} (${BOTCHAIN_NETWORK_CONFIG.chainId}).`,
            });
          }
        }
      } catch (err: any) {
        setTxMessage({ type: 'error', text: err.message || 'Failed to connect wallet' });
      }
    } else {
      setTxMessage({ type: 'error', text: 'MetaMask or Web3 wallet not detected!' });
    }
  };

  // Listen to Account and Network Changes
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const handleAccountsChanged = async (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          try {
            const botchainProvider = getReadOnlyProvider();
            const balance = await botchainProvider.getBalance(accounts[0]);
            setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
          } catch {
            if (provider) {
              const balance = await provider.getBalance(accounts[0]);
              setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
            }
          }
        } else {
          setAccount(null);
          setWalletBalance('0');
        }
      };

      const handleChainChanged = (newChainIdHex: string) => {
        const newChainId = parseInt(newChainIdHex, 16);
        setChainId(newChainId);
        window.location.reload();
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', handleChainChanged);

      return () => {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [provider]);

  // Check already connected provider on load
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const p = new BrowserProvider((window as any).ethereum);
      setProvider(p);
      p.send('eth_accounts', [])
        .then(async (accounts: string[]) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            const network = await p.getNetwork();
            setChainId(Number(network.chainId));
            try {
              const botchainProvider = getReadOnlyProvider();
              const balance = await botchainProvider.getBalance(accounts[0]);
              setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
            } catch {
              const balance = await p.getBalance(accounts[0]);
              setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Get Contract instance (read-only with fallback or with signer)
  const getContract = async (withSigner = false) => {
    try {
      if (withSigner) {
        if (!account && typeof window !== 'undefined' && (window as any).ethereum) {
          await connectWallet();
        }
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          const browserProvider = provider || new BrowserProvider((window as any).ethereum);
          if (!provider) setProvider(browserProvider);
          const signer = await browserProvider.getSigner();
          return new Contract(contractAddress, CURIO_ABI, signer);
        }
        return null;
      }

      // Read-only contract uses public Botchain RPC provider directly
      // This ensures all users can view listed NFTs without connecting a wallet
      return getReadOnlyContract(contractAddress);
    } catch (err) {
      console.error('Error instantiating contract:', err);
      if (!withSigner) {
        return getReadOnlyContract(contractAddress);
      }
      return null;
    }
  };

  // Load Marketplace & User NFTs directly from contract (Indexer-less!)
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const contract = await getContract(false);
      if (!contract) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch total minted count
      try {
        const minted = await contract.totalMinted();
        setTotalMinted(Number(minted));
      } catch (e) {
        console.error('Error fetching totalMinted:', e);
      }

      // 2. Fetch all active listings in 1 single RPC call
      try {
        const listingsRaw = await contract.getAllActiveListings();
        const formattedListings: NFTItem[] = listingsRaw.map((item: any) => ({
          tokenId: item.tokenId,
          tokenURI: item.tokenURI,
          owner: item.owner,
          seller: item.seller,
          price: item.price,
          isListed: item.isListed,
        }));
        setActiveListings(formattedListings);
      } catch (e) {
        console.error('Error fetching active listings:', e);
      }

      // 3. If user is connected, fetch user's NFTs in 1 single RPC call
      if (account) {
        try {
          const userItemsRaw = await contract.getUserNFTs(account);
          const formattedUserNFTs: NFTItem[] = userItemsRaw.map((item: any) => ({
            tokenId: item.tokenId,
            tokenURI: item.tokenURI,
            owner: item.owner,
            seller: item.seller,
            price: item.price,
            isListed: item.isListed,
          }));
          setUserNFTs(formattedUserNFTs);

          // Update balance directly from Botchain RPC
          try {
            const botchainProvider = getReadOnlyProvider();
            const balance = await botchainProvider.getBalance(account);
            setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
          } catch {
            if (provider) {
              const balance = await provider.getBalance(account);
              setWalletBalance(parseFloat(formatEther(balance)).toFixed(4));
            }
          }
        } catch (e) {
          console.error('Error fetching user NFTs:', e);
        }
      }
    } catch (err: any) {
      console.error('Error fetching contract data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [account, contractAddress]);

  // Image Selection for Minting
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Add/Remove Custom Attribute for Minting
  const handleAddAttribute = () => {
    setNftAttributes([...nftAttributes, { trait_type: '', value: '' }]);
  };

  const handleAttributeChange = (index: number, field: 'trait_type' | 'value', value: string) => {
    const next = [...nftAttributes];
    next[index][field] = value;
    setNftAttributes(next);
  };

  const handleRemoveAttribute = (index: number) => {
    setNftAttributes(nftAttributes.filter((_, i) => i !== index));
  };

  // MINT NFT ACTION
  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      await connectWallet();
      return;
    }

    if (chainId !== BOTCHAIN_NETWORK_CONFIG.chainId) {
      await switchToBotchain();
      return;
    }

    let finalTokenURI = '';

    try {
      setIsActionLoading(true);

      if (mintMode === 'pinata') {
        if (!imageFile) {
          setTxMessage({ type: 'error', text: 'Please select an image file to upload to IPFS' });
          setIsActionLoading(false);
          return;
        }
        if (!nftName.trim()) {
          setTxMessage({ type: 'error', text: 'NFT Name is required' });
          setIsActionLoading(false);
          return;
        }

        // Phase 1: Upload image to Pinata IPFS
        setMintStep('uploading-image');
        setTxMessage({ type: 'info', text: 'Step 1/3: Uploading image to Pinata IPFS...' });

        // Phase 2: Upload metadata JSON to Pinata IPFS
        setMintStep('uploading-metadata');
        setTxMessage({ type: 'info', text: 'Step 2/3: Generating and pinning metadata JSON to Pinata IPFS...' });

        const validAttributes = nftAttributes.filter(
          (a) => a.trait_type.trim() !== '' && a.value.trim() !== ''
        );

        const pinataResult = await uploadNFTToPinata(
          imageFile,
          {
            name: nftName,
            description: nftDescription,
            attributes: validAttributes,
          },
          pinataJwt
        );

        finalTokenURI = pinataResult.tokenURI;
      } else {
        // Manual mode
        if (!manualTokenURI.trim()) {
          setTxMessage({ type: 'error', text: 'TokenURI is required' });
          setIsActionLoading(false);
          return;
        }
        finalTokenURI = manualTokenURI.trim();
      }

      // Phase 3: Mint on Botchain Mainnet
      setMintStep('awaiting-tx');
      setCurrentMintTokenURI(finalTokenURI);
      setTxMessage({
        type: 'info',
        text: 'Step 3/3: Awaiting wallet transaction signature...',
      });

      // Console.log the tokenURI before trying to mint NFT so user can verify
      console.log('====================================================');
      console.log('🚀 [Curio] Prepared TokenURI for Minting:');
      console.log('➡️ TokenURI:', finalTokenURI);
      console.log('🌐 IPFS Gateway URL:', resolveIPFS(finalTokenURI));
      console.log('====================================================');

      const contract = await getContract(true);
      if (!contract) throw new Error('Contract instance not available');

      const tx = await contract.mintNFT(finalTokenURI);
      setMintStep('confirming');
      setTxMessage({
        type: 'info',
        text: `Mint transaction submitted (${tx.hash.slice(0, 10)}...). Waiting for confirmation on Botchain...`,
        txHash: tx.hash,
      });

      const receipt = await tx.wait();

      // Find NFTMinted event to extract tokenId
      let mintedTokenId = '';
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === 'NFTMinted') {
              mintedTokenId = parsed.args.tokenId.toString();
              break;
            }
          } catch {
            // Not a contract event we care about
          }
        }
      }

      setMintStep('completed');
      setLastMintedResult({
        tokenId: mintedTokenId || 'Success',
        tokenURI: finalTokenURI,
        imageURI: imagePreview || resolveIPFS(finalTokenURI),
        txHash: tx.hash,
      });

      setTxMessage({
        type: 'success',
        text: `NFT successfully minted on Botchain Mainnet! ${mintedTokenId ? `Token ID #${mintedTokenId}` : ''}`,
        txHash: tx.hash,
      });

      // Reset form
      setImageFile(null);
      setImagePreview(null);
      setNftName('');
      setNftDescription('');
      setManualTokenURI('');
      setNftAttributes([{ trait_type: '', value: '' }]);

      await fetchData();
    } catch (err: any) {
      console.error('Minting error:', err);
      setMintStep('idle');
      setTxMessage({
        type: 'error',
        text: err.reason || err.message || 'Minting failed. Please check wallet and try again.',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // LIST NFT FOR SALE ACTION
  const handleListNFT = async () => {
    if (!selectedTokenForListing || !listingPrice) return;
    try {
      setIsActionLoading(true);
      setTxMessage({
        type: 'info',
        text: `Listing Token #${selectedTokenForListing.tokenId.toString()} for ${listingPrice} ${CURRENCY_SYMBOL}...`,
      });

      const contract = await getContract(true);
      if (!contract) throw new Error('Contract not available');

      const priceWei = parseEther(listingPrice);
      const tx = await contract.listNFT(selectedTokenForListing.tokenId, priceWei);
      setTxMessage({
        type: 'info',
        text: `Listing transaction submitted! Awaiting confirmation...`,
        txHash: tx.hash,
      });
      await tx.wait();

      setTxMessage({
        type: 'success',
        text: `Token #${selectedTokenForListing.tokenId.toString()} listed successfully on marketplace!`,
        txHash: tx.hash,
      });
      setSelectedTokenForListing(null);
      setListingPrice('');
      await fetchData();
    } catch (err: any) {
      console.error('List error:', err);
      setTxMessage({ type: 'error', text: err.reason || err.message || 'Listing failed' });
    } finally {
      setIsActionLoading(false);
    }
  };

  // UPDATE LISTING PRICE ACTION
  const handleUpdatePrice = async () => {
    if (!selectedTokenForPriceUpdate || !newPriceInput) return;
    try {
      setIsActionLoading(true);
      setTxMessage({
        type: 'info',
        text: `Updating price for Token #${selectedTokenForPriceUpdate.tokenId.toString()} to ${newPriceInput} ${CURRENCY_SYMBOL}...`,
      });

      const contract = await getContract(true);
      if (!contract) throw new Error('Contract not available');

      const priceWei = parseEther(newPriceInput);
      const tx = await contract.updateListingPrice(selectedTokenForPriceUpdate.tokenId, priceWei);
      setTxMessage({
        type: 'info',
        text: `Updating price transaction submitted! Awaiting confirmation...`,
        txHash: tx.hash,
      });
      await tx.wait();

      setTxMessage({
        type: 'success',
        text: `Price for Token #${selectedTokenForPriceUpdate.tokenId.toString()} updated to ${newPriceInput} ${CURRENCY_SYMBOL}!`,
        txHash: tx.hash,
      });
      setSelectedTokenForPriceUpdate(null);
      setNewPriceInput('');
      await fetchData();
    } catch (err: any) {
      console.error('Update price error:', err);
      setTxMessage({ type: 'error', text: err.reason || err.message || 'Price update failed' });
    } finally {
      setIsActionLoading(false);
    }
  };

  // CANCEL LISTING ACTION
  const handleCancelListing = async (tokenId: bigint) => {
    try {
      setIsActionLoading(true);
      setTxMessage({
        type: 'info',
        text: `Canceling listing for Token #${tokenId.toString()}...`,
      });
      const contract = await getContract(true);
      if (!contract) throw new Error('Contract not available');

      const tx = await contract.cancelListing(tokenId);
      setTxMessage({
        type: 'info',
        text: `Delisting transaction submitted! Awaiting confirmation...`,
        txHash: tx.hash,
      });
      await tx.wait();

      setTxMessage({
        type: 'success',
        text: `Listing for Token #${tokenId.toString()} canceled!`,
        txHash: tx.hash,
      });
      await fetchData();
    } catch (err: any) {
      console.error('Cancel listing error:', err);
      setTxMessage({ type: 'error', text: err.reason || err.message || 'Delisting failed' });
    } finally {
      setIsActionLoading(false);
    }
  };

  // BUY NFT ACTION
  const handleBuyNFT = async (item: NFTItem) => {
    if (!account) {
      await connectWallet();
      return;
    }
    if (chainId !== BOTCHAIN_NETWORK_CONFIG.chainId) {
      await switchToBotchain();
      return;
    }
    try {
      setIsActionLoading(true);
      setTxMessage({
        type: 'info',
        text: `Purchasing Token #${item.tokenId.toString()} for ${formatEther(item.price)} ${CURRENCY_SYMBOL}...`,
      });

      const contract = await getContract(true);
      if (!contract) throw new Error('Contract not available');

      const tx = await contract.buyNFT(item.tokenId, { value: item.price });
      setTxMessage({
        type: 'info',
        text: `Purchase transaction submitted! Awaiting confirmation on Botchain...`,
        txHash: tx.hash,
      });
      await tx.wait();

      setTxMessage({
        type: 'success',
        text: `Congratulations! Successfully purchased Token #${item.tokenId.toString()}!`,
        txHash: tx.hash,
      });
      await fetchData();
    } catch (err: any) {
      console.error('Buy error:', err);
      setTxMessage({ type: 'error', text: err.reason || err.message || 'Purchase failed' });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Filter and sort active listings
  const filteredListings = activeListings
    .filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const cached = getCachedNFTMetadata(item.tokenURI);
      const name = cached?.name?.toLowerCase() || '';
      return (
        item.tokenId.toString().includes(q) ||
        item.seller.toLowerCase().includes(q) ||
        item.tokenURI.toLowerCase().includes(q) ||
        name.includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'id-desc') return Number(b.tokenId - a.tokenId);
      if (sortBy === 'id-asc') return Number(a.tokenId - b.tokenId);
      if (sortBy === 'price-asc') return a.price < b.price ? -1 : 1;
      if (sortBy === 'price-desc') return a.price > b.price ? -1 : 1;
      return 0;
    });

  const isWrongNetwork = account && chainId !== BOTCHAIN_NETWORK_CONFIG.chainId;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Top Header Navigation */}
      <header className="border-b border-gray-800/80 bg-[#0d1322]/90 backdrop-blur-md sticky top-0 z-40 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-purple-100 to-indigo-300 bg-clip-text text-transparent">
                  Curio
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Botchain
                </span>
              </div>
              <p className="text-[11px] text-gray-400">NFT Marketplace</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex space-x-1.5 bg-gray-900/80 p-1.5 rounded-2xl border border-gray-800">
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'marketplace'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Explore ({activeListings.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('my-nfts')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'my-nfts'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>My NFTs ({userNFTs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('mint')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'mint'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Mint</span>
            </button>
            <button
              onClick={() => setActiveTab('network-info')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'network-info'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>Info</span>
            </button>
          </nav>

          {/* Right Area: Network Pill & Wallet */}
          <div className="flex items-center space-x-2.5">
            {/* Network indicator */}
            {account && (
              isWrongNetwork ? (
                <button
                  onClick={switchToBotchain}
                  className="flex items-center space-x-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 text-xs px-3 py-2 rounded-xl transition cursor-pointer font-medium"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Switch to Botchain</span>
                </button>
              ) : (
                <div className="hidden sm:flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs text-emerald-300 font-medium">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{BOTCHAIN_NETWORK_CONFIG.chainName} ({BOTCHAIN_NETWORK_CONFIG.chainId})</span>
                </div>
              )
            )}

            {/* Wallet Info / Connect Button */}
            {account ? (
              <div className="flex items-center space-x-2">
                <div className="hidden lg:flex items-center space-x-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs font-mono text-purple-300">
                  <Coins className="w-3.5 h-3.5 text-purple-400" />
                  <span>{walletBalance} {CURRENCY_SYMBOL}</span>
                </div>
                <div className="flex items-center space-x-2 bg-gray-800/90 border border-gray-700/80 rounded-xl px-3.5 py-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-xs font-mono font-semibold text-gray-200">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Connect Wallet</span>
              </button>
            )}

            {/* Refresh State Button */}
            <button
              onClick={fetchData}
              title="Refresh contract state directly on-chain"
              className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden px-4 pb-3 overflow-x-auto space-x-2">
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'marketplace' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'
            }`}
          >
            Explore ({activeListings.length})
          </button>
          <button
            onClick={() => setActiveTab('my-nfts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'my-nfts' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'
            }`}
          >
            My NFTs ({userNFTs.length})
          </button>
          <button
            onClick={() => setActiveTab('mint')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'mint' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'
            }`}
          >
            Mint NFT
          </button>
          <button
            onClick={() => setActiveTab('network-info')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'network-info' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'
            }`}
          >
            Network Info
          </button>
        </div>
      </header>

      {/* Contract & Network Address Sub-header */}
      <div className="bg-gray-950/70 border-b border-gray-800/80 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-gray-400 truncate w-full md:w-auto">
            <span className="text-gray-500 font-medium">Curio Contract:</span>
            {isEditingAddress ? (
              <div className="flex items-center space-x-1.5 flex-1">
                <input
                  type="text"
                  value={tempAddress}
                  onChange={(e) => setTempAddress(e.target.value)}
                  className="bg-gray-900 border border-purple-500/50 rounded px-2 py-0.5 text-xs text-purple-300 font-mono focus:outline-none"
                />
                <button
                  onClick={() => {
                    setContractAddress(tempAddress);
                    setIsEditingAddress(false);
                  }}
                  className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setTempAddress(contractAddress);
                    setIsEditingAddress(false);
                  }}
                  className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <a
                  href={`https://scan.botchain.ai/address/${contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-purple-400 hover:text-purple-300 flex items-center space-x-1 transition"
                  title="View contract on Botchain Explorer"
                >
                  <span>{contractAddress}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
                <button
                  onClick={() => setIsEditingAddress(true)}
                  title="Edit Contract Address"
                  className="text-gray-500 hover:text-purple-300 transition"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4 text-[11px] text-gray-400">
            <div className="flex items-center space-x-1">
              <span className="text-gray-500">Chain ID:</span>
              <span className="text-gray-300 font-mono">{BOTCHAIN_NETWORK_CONFIG.chainId}</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-500">Fee:</span>
              <span className="text-emerald-400 font-semibold">0% Platform Fee</span>
            </div>
            <button
              onClick={() => setShowJwtModal(true)}
              className="flex items-center space-x-1 text-purple-400 hover:text-purple-300 transition cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              <span>IPFS: {isJwtValid ? 'Pinata Connected' : 'Config JWT'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Network Alert (if wrong network) */}
      {isWrongNetwork && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                Your wallet is currently connected to chain ID <strong>{chainId}</strong>. Please switch to{' '}
                <strong>{BOTCHAIN_NETWORK_CONFIG.chainName} (Chain ID {BOTCHAIN_NETWORK_CONFIG.chainId})</strong> to mint, list, and buy NFTs.
              </span>
            </div>
            <button
              onClick={switchToBotchain}
              className="px-3 py-1 bg-amber-500 text-gray-950 font-bold rounded-lg text-xs hover:bg-amber-400 transition cursor-pointer shrink-0 ml-4"
            >
              Switch Network
            </button>
          </div>
        </div>
      )}

      {/* Alert / Notification Toast */}
      {txMessage && (
        <div className="max-w-7xl mx-auto w-full px-4 mt-4">
          <div
            className={`flex items-center justify-between p-4 rounded-2xl border shadow-lg ${
              txMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : txMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              {txMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : txMessage.type === 'error' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <Info className="w-5 h-5 flex-shrink-0" />
              )}
              <div className="text-sm">
                <span>{txMessage.text}</span>
                {txMessage.txHash && (
                  <a
                    href={`https://scan.botchain.ai/tx/${txMessage.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 underline font-mono text-xs hover:text-white inline-flex items-center space-x-1"
                  >
                    <span>View on Botchain Explorer</span>
                    <ExternalLink className="w-3 h-3 ml-0.5 inline" />
                  </a>
                )}
              </div>
            </div>
            <button
              onClick={() => setTxMessage(null)}
              className="text-gray-400 hover:text-white ml-3 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* TAB 1: EXPLORE / MARKETPLACE */}
        {activeTab === 'marketplace' && (
          <div>
            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-gray-900 border border-purple-500/20 p-8 sm:p-10 mb-8 shadow-2xl">
              <div className="relative z-10 max-w-2xl">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Powered by Botchain Mainnet (Chain ID 677)</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Zero Fee <br />
                  <span className="bg-gradient-to-r from-purple-400 via-pink-300 to-indigo-300 bg-clip-text text-transparent">
                    NFT Marketplace
                  </span>
                </h1>
                <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
                  Mint, list, and trade NFTs directly on-chain using <strong>{CURRENCY_SYMBOL}</strong>. 
                  All marketplace queries execute instantly without off-chain indexers, and sellers receive 100% of the sale price.
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button
                    onClick={() => setActiveTab('mint')}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition cursor-pointer flex items-center space-x-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Mint with Pinata IPFS</span>
                  </button>
                  <a
                    href={`https://scan.botchain.ai/address/${contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-900/80 hover:bg-gray-800 text-gray-300 font-medium text-sm px-4 py-2.5 rounded-xl border border-gray-700 transition flex items-center space-x-2"
                  >
                    <span>View Contract on Explorer</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
              <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-6 border-b border-gray-800 mb-8">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by Token ID or seller..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900/80 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-gray-900/80 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-400">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="bg-transparent text-gray-200 focus:outline-none cursor-pointer"
                  >
                    <option value="id-desc" className="bg-gray-900">Newest First</option>
                    <option value="id-asc" className="bg-gray-900">Oldest First</option>
                    <option value="price-asc" className="bg-gray-900">Price: Low to High</option>
                    <option value="price-desc" className="bg-gray-900">Price: High to Low</option>
                  </select>
                </div>

                <div className="text-xs text-gray-400 bg-gray-900/80 border border-gray-800 px-3 py-2 rounded-xl">
                  <span>{filteredListings.length} Listed</span>
                </div>
              </div>
            </div>

            {/* Marketplace Grid */}
            {filteredListings.length === 0 ? (
              <div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-gray-800/80">
                <ShoppingBag className="w-14 h-14 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-200">No Active Listings Found</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto mt-1.5 mb-6">
                  {searchQuery
                    ? 'No listings match your search criteria. Try a different query.'
                    : 'Be the first creator to mint an NFT with Pinata IPFS and list it on Botchain!'}
                </p>
                <button
                  onClick={() => setActiveTab('mint')}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-purple-600/25"
                >
                  Mint New NFT
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredListings.map((item) => (
                  <NFTCard
                    key={item.tokenId.toString()}
                    item={item}
                    account={account}
                    currencySymbol={CURRENCY_SYMBOL}
                    onBuy={handleBuyNFT}
                    onCancelListing={handleCancelListing}
                    onOpenUpdatePriceModal={(it) => {
                      setSelectedTokenForPriceUpdate(it);
                      setNewPriceInput(formatEther(it.price));
                    }}
                    isActionLoading={isActionLoading}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY NFTS */}
        {activeTab === 'my-nfts' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-800 mb-8 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">My NFT Collection</h1>
                <p className="text-gray-400 text-sm mt-1">
                  Manage your minted and purchased NFTs on Botchain. List items for sale with your custom price.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveTab('mint')}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition cursor-pointer shadow-md flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Mint New</span>
                </button>
              </div>
            </div>

            {!account ? (
              <div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-gray-800">
                <Wallet className="w-14 h-14 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-200">Wallet Not Connected</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto mt-1 mb-6">
                  Connect your Web3 wallet to load your on-chain NFT portfolio.
                </p>
                <button
                  onClick={connectWallet}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  Connect Wallet
                </button>
              </div>
            ) : userNFTs.length === 0 ? (
              <div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-gray-800">
                <Sparkles className="w-14 h-14 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-200">No NFTs Owned Yet</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto mt-1 mb-6">
                  You do not own any Curio NFTs on this wallet. Mint your first one or explore the marketplace!
                </p>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setActiveTab('mint')}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer shadow-md"
                  >
                    Mint an NFT Now
                  </button>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
                  >
                    Browse Marketplace
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {userNFTs.map((item) => (
                  <NFTCard
                    key={item.tokenId.toString()}
                    item={item}
                    account={account}
                    currencySymbol={CURRENCY_SYMBOL}
                    onCancelListing={handleCancelListing}
                    onOpenListModal={(it) => {
                      setSelectedTokenForListing(it);
                      setListingPrice('1.0');
                    }}
                    onOpenUpdatePriceModal={(it) => {
                      setSelectedTokenForPriceUpdate(it);
                      setNewPriceInput(formatEther(it.price));
                    }}
                    isActionLoading={isActionLoading}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MINT NFT WITH PINATA IPFS */}
        {activeTab === 'mint' && (
          <div className="max-w-2xl mx-auto">
            <div className="pb-6 border-b border-gray-800 mb-8">
              <div className="flex items-center space-x-2 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>NFT Minting Studio</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Mint New NFT</h1>
              <p className="text-gray-400 text-sm mt-1">
                Upload your digital asset to <strong>Pinata IPFS</strong> and mint the NFT directly to the Curio smart contract on Botchain.
              </p>
            </div>

            {/* Pinata Status Banner */}
            <div className="mb-6 p-4 rounded-2xl bg-gray-900/90 border border-gray-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isJwtValid ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' : 'bg-amber-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold text-gray-200">
                    Pinata IPFS: {isJwtValid ? 'Authenticated & Ready' : 'Authentication Needed'}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {isJwtValid
                      ? 'Files and metadata will be permanently pinned to IPFS.'
                      : 'Please check your Pinata JWT in .env or click Configure.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowJwtModal(true)}
                className="text-xs text-purple-400 hover:text-purple-300 font-medium px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-pointer"
              >
                Configure JWT
              </button>
            </div>

            {/* Mint Mode Selector */}
            <div className="flex space-x-2 p-1 bg-gray-900 rounded-xl border border-gray-800 mb-6">
              <button
                type="button"
                onClick={() => setMintMode('pinata')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                  mintMode === 'pinata'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Pinata IPFS Upload (Automated)</span>
              </button>
              <button
                type="button"
                onClick={() => setMintMode('manual')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                  mintMode === 'manual'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>Manual TokenURI</span>
              </button>
            </div>

            {/* Mint Form */}
            <form onSubmit={handleMint} className="space-y-6 bg-gray-900/60 p-6 sm:p-8 rounded-3xl border border-gray-800 backdrop-blur-md">
              {mintMode === 'pinata' ? (
                <>
                  {/* Image Picker */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-200 mb-2">
                      Upload NFT Artwork / Media *
                    </label>
                    <div className="border-2 border-dashed border-gray-700 hover:border-purple-500/50 rounded-2xl p-6 text-center cursor-pointer transition relative bg-gray-950/50">
                      <input
                        type="file"
                        accept="image/*"
                        required={!imageFile}
                        onChange={handleImageChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {imagePreview ? (
                        <div className="relative w-52 h-52 mx-auto rounded-xl overflow-hidden shadow-xl border border-gray-700">
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-sm py-1 px-2 rounded text-[11px] text-gray-300 truncate">
                            {imageFile?.name}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3">
                            <Upload className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-semibold text-gray-200">Click or drag image file here</p>
                          <p className="text-xs text-gray-500 mt-1">Supports PNG, JPG, GIF, WebP, SVG (Uploaded to Pinata IPFS)</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* NFT Name & Description */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-200 mb-1.5">
                        NFT Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Botchain Pioneer #001"
                        value={nftName}
                        onChange={(e) => setNftName(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-200 mb-1.5">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Describe your collectible, story, or utility..."
                        value={nftDescription}
                        onChange={(e) => setNftDescription(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500 transition resize-none"
                      />
                    </div>
                  </div>

                  {/* Attributes Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-gray-200">
                        Attributes / Traits (Optional)
                      </label>
                      <button
                        type="button"
                        onClick={handleAddAttribute}
                        className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Trait</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {nftAttributes.map((attr, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Trait Type (e.g. Rarity)"
                            value={attr.trait_type}
                            onChange={(e) => handleAttributeChange(idx, 'trait_type', e.target.value)}
                            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                          />
                          <input
                            type="text"
                            placeholder="Value (e.g. Legendary)"
                            value={attr.value}
                            onChange={(e) => handleAttributeChange(idx, 'value', e.target.value)}
                            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                          />
                          {nftAttributes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAttribute(idx)}
                              className="p-1.5 text-gray-500 hover:text-rose-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Manual TokenURI Mode */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-200 mb-1.5">
                      Metadata TokenURI (IPFS URI or HTTP URL) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ipfs://bafybeig.../metadata.json or https://..."
                      value={manualTokenURI}
                      onChange={(e) => setManualTokenURI(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-purple-300 font-mono focus:outline-none focus:border-purple-500 transition"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      This URI will be stored permanently on-chain in the smart contract's <code className="text-purple-400">_tokenURIs</code> mapping.
                    </p>
                  </div>
                </div>
              )}

              {/* Mint Progress Indicator */}
              {mintStep !== 'idle' && (
                <div className="p-4 rounded-2xl bg-gray-950 border border-purple-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-purple-300">
                      {mintStep === 'uploading-image' && '1/3 Pinning Image to IPFS...'}
                      {mintStep === 'uploading-metadata' && '2/3 Pinning Metadata JSON to IPFS...'}
                      {mintStep === 'awaiting-tx' && '3/3 Please confirm transaction in your wallet...'}
                      {mintStep === 'confirming' && 'Confirming block on Botchain...'}
                      {mintStep === 'completed' && 'Mint Completed!'}
                    </span>
                    <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${mintStep !== 'completed' ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-500"
                      style={{
                        width:
                          mintStep === 'uploading-image'
                            ? '33%'
                            : mintStep === 'uploading-metadata'
                            ? '66%'
                            : mintStep === 'awaiting-tx'
                            ? '85%'
                            : mintStep === 'confirming'
                            ? '95%'
                            : mintStep === 'completed'
                            ? '100%'
                            : '0%',
                      }}
                    />
                  </div>

                  {currentMintTokenURI && (
                    <div className="pt-2 border-t border-gray-800 text-[11px] text-gray-400 font-mono truncate flex items-center justify-between">
                      <span className="text-gray-500 flex-shrink-0 mr-2">TokenURI:</span>
                      <a
                        href={resolveIPFS(currentMintTokenURI)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-300 hover:text-purple-200 underline truncate flex items-center space-x-1"
                        title={currentMintTokenURI}
                      >
                        <span className="truncate">{currentMintTokenURI}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0 ml-1 inline" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isActionLoading || !account}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg cursor-pointer ${
                  isActionLoading || !account
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30'
                }`}
              >
                {!account
                  ? 'Connect Wallet to Mint'
                  : isWrongNetwork
                  ? 'Switch Network to Mint'
                  : isActionLoading
                  ? 'Processing Mint...'
                  : 'Mint NFT to Botchain'}
              </button>
            </form>

            {/* Last Minted Success Card */}
            {lastMintedResult && (
              <div className="mt-8 p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 shadow-xl">
                <div className="flex items-center space-x-2 text-emerald-300 font-bold text-sm mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>NFT Successfully Minted!</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400">Token ID:</span>
                    <div className="font-bold text-white text-base">#{lastMintedResult.tokenId}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Transaction:</span>
                    <div className="truncate">
                      <a
                        href={`https://scan.botchain.ai/tx/${lastMintedResult.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 font-mono underline inline-flex items-center space-x-1"
                      >
                        <span>{lastMintedResult.txHash?.slice(0, 14)}...</span>
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-gray-400">Token URI:</span>
                    <div className="truncate text-purple-300 font-mono">
                      <a
                        href={resolveIPFS(lastMintedResult.tokenURI || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center space-x-1"
                      >
                        <span className="truncate">{lastMintedResult.tokenURI}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex space-x-3">
                  <button
                    onClick={() => setActiveTab('my-nfts')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                  >
                    View in My NFTs
                  </button>
                  <button
                    onClick={() => setLastMintedResult(null)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: NETWORK & CONTRACT INFO */}
        {activeTab === 'network-info' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="pb-6 border-b border-gray-800">
              <h1 className="text-2xl font-bold text-white tracking-tight">Botchain Network & Contract Details</h1>
              <p className="text-gray-400 text-sm mt-1">
                Technical configuration, verification status, and smart contract architecture.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Network</span>
                <div className="text-lg font-bold text-white mt-1">Botchain Mainnet</div>
                <div className="text-xs text-gray-400 mt-2 space-y-1 font-mono">
                  <div>Chain ID: <strong>677</strong> (0x2a5)</div>
                  <div>Native Token: <strong>BOT</strong> (18 decimals)</div>
                  <div>Total Supply: <strong>150 Million BOT</strong></div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">RPC Endpoint</span>
                <div className="text-lg font-bold text-white mt-1">Botchain RPC</div>
                <div className="text-xs text-gray-400 mt-2 space-y-1 font-mono">
                  <div className="truncate">URL: <strong>https://rpc.botchain.ai</strong></div>
                  <div>Status: <span className="text-emerald-400 font-semibold">Active & Synced</span></div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Smart Contract</span>
                <div className="text-lg font-bold text-white mt-1">CurioNFTMarketplace.sol</div>
                <div className="text-xs text-gray-400 mt-2 space-y-1 font-mono">
                  <div className="truncate">
                    Address:{' '}
                    <a
                      href={`https://scan.botchain.ai/address/${contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline"
                    >
                      {contractAddress}
                    </a>
                  </div>
                  <div>Total Minted: <strong>{totalMinted} NFTs</strong></div>
                  <div>Active Listings: <strong>{activeListings.length}</strong></div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Block Explorer</span>
                <div className="text-lg font-bold text-white mt-1">Botchain Scan</div>
                <div className="text-xs text-gray-400 mt-2 space-y-1 font-mono">
                  <div>
                    Explorer:{' '}
                    <a
                      href="https://scan.botchain.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline"
                    >
                      https://scan.botchain.ai
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-3">
              <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Indexer-less Architecture & Zero Selling Fee</span>
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Curio eliminates external indexers (such as The Graph or off-chain SQL databases) by maintaining $O(1)$ swap-and-pop mappings directly inside the Solidity smart contract. View functions such as <code className="text-purple-300 font-mono">getAllActiveListings()</code> and <code className="text-purple-300 font-mono">getUserNFTs(address)</code> return complete NFTItem datasets in a single RPC round-trip.
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">
                Additionally, <strong>100% of the purchase price</strong> is transferred directly from buyer to seller upon sale, with zero protocol or marketplace cuts.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* LIST NFT MODAL */}
      {selectedTokenForListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">List NFT for Sale</h3>
              <button
                onClick={() => setSelectedTokenForListing(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-6">
              <div className="flex items-center space-x-4 mb-4 p-3.5 bg-gray-950 rounded-2xl border border-gray-800">
                <img
                  src={
                    getCachedNFTMetadata(selectedTokenForListing.tokenURI)?.image
                      ? resolveIPFS(getCachedNFTMetadata(selectedTokenForListing.tokenURI)!.image!)
                      : 'https://placehold.co/100x100/161b26/a855f7?text=NFT'
                  }
                  alt="Token preview"
                  className="w-14 h-14 rounded-xl object-cover bg-gray-900"
                  onError={(e) => {
                    (e.target as HTMLElement).setAttribute(
                      'src',
                      'https://placehold.co/100x100/161b26/a855f7?text=NFT'
                    );
                  }}
                />
                <div>
                  <h4 className="font-bold text-white">Token #{selectedTokenForListing.tokenId.toString()}</h4>
                  <p className="text-xs text-emerald-400 font-medium">0% marketplace fee (100% to you)</p>
                </div>
              </div>

              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Listing Price (in {CURRENCY_SYMBOL}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.0001"
                  placeholder="1.0"
                  value={listingPrice}
                  onChange={(e) => setListingPrice(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-4 pr-16 py-3 text-white font-mono text-lg focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-4 top-3.5 text-sm font-bold text-purple-400">
                  {CURRENCY_SYMBOL}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Upon purchase, the buyer sends native <strong>{CURRENCY_SYMBOL}</strong> and 100% of the funds go directly into your account.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setSelectedTokenForListing(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl transition cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleListNFT}
                disabled={isActionLoading || !listingPrice}
                className={`flex-1 font-bold py-2.5 rounded-xl transition cursor-pointer text-sm ${
                  isActionLoading || !listingPrice
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                }`}
              >
                {isActionLoading ? 'Listing...' : 'Confirm Listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE PRICE MODAL */}
      {selectedTokenForPriceUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">Update Listing Price</h3>
              <button
                onClick={() => setSelectedTokenForPriceUpdate(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-6">
              <div className="flex items-center space-x-4 mb-4 p-3.5 bg-gray-950 rounded-2xl border border-gray-800">
                <img
                  src={
                    getCachedNFTMetadata(selectedTokenForPriceUpdate.tokenURI)?.image
                      ? resolveIPFS(getCachedNFTMetadata(selectedTokenForPriceUpdate.tokenURI)!.image!)
                      : 'https://placehold.co/100x100/161b26/a855f7?text=NFT'
                  }
                  alt="Token preview"
                  className="w-14 h-14 rounded-xl object-cover bg-gray-900"
                  onError={(e) => {
                    (e.target as HTMLElement).setAttribute(
                      'src',
                      'https://placehold.co/100x100/161b26/a855f7?text=NFT'
                    );
                  }}
                />
                <div>
                  <h4 className="font-bold text-white">Token #{selectedTokenForPriceUpdate.tokenId.toString()}</h4>
                  <p className="text-xs text-gray-400">
                    Current: {formatEther(selectedTokenForPriceUpdate.price)} {CURRENCY_SYMBOL}
                  </p>
                </div>
              </div>

              <label className="block text-sm font-semibold text-gray-300 mb-2">
                New Price (in {CURRENCY_SYMBOL}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.0001"
                  value={newPriceInput}
                  onChange={(e) => setNewPriceInput(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-4 pr-16 py-3 text-white font-mono text-lg focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-4 top-3.5 text-sm font-bold text-purple-400">
                  {CURRENCY_SYMBOL}
                </span>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setSelectedTokenForPriceUpdate(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl transition cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdatePrice}
                disabled={isActionLoading || !newPriceInput}
                className={`flex-1 font-bold py-2.5 rounded-xl transition cursor-pointer text-sm ${
                  isActionLoading || !newPriceInput
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                }`}
              >
                {isActionLoading ? 'Updating...' : 'Update Price'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PINATA IPFS JWT CONFIGURATION MODAL */}
      {showJwtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Pinata IPFS JWT Settings</h3>
              </div>
              <button
                onClick={() => setShowJwtModal(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-5 space-y-4">
              <p className="text-xs text-gray-400">
                This JWT token is loaded from your <code className="text-purple-300">.env</code> file (<code className="text-purple-300">VITE_PINATA_JWT</code>). It is used to authenticate with Pinata's IPFS pinning endpoints when uploading NFT media and metadata.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Pinata Scoped JWT Token
                </label>
                <textarea
                  rows={4}
                  value={pinataJwt}
                  onChange={(e) => {
                    setPinataJwt(e.target.value);
                    setIsJwtValid(null);
                  }}
                  placeholder="Paste Pinata JWT here..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500 resize-none break-all"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-2 text-xs">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isJwtValid === true
                        ? 'bg-emerald-400'
                        : isJwtValid === false
                        ? 'bg-rose-400'
                        : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-gray-300">
                    {isJwtValid === true
                      ? 'Authenticated successfully'
                      : isJwtValid === false
                      ? 'Invalid token or unauthorized'
                      : 'Not tested yet'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const valid = await testPinataConnection(pinataJwt);
                    setIsJwtValid(valid);
                  }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-purple-300 rounded-lg text-xs font-medium cursor-pointer transition"
                >
                  Test Connection
                </button>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowJwtModal(false)}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer text-xs"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-900 bg-gray-950/80 py-8 text-xs text-gray-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded-lg bg-purple-600 flex items-center justify-center text-white">
              <Sparkles className="w-3 h-3" />
            </div>
            <p>© 2026 Curio NFT Marketplace — Zero Fee on Botchain Mainnet (677)</p>
          </div>
          <div className="flex space-x-4">
            <a
              href="https://scan.botchain.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 flex items-center space-x-1"
            >
              <span>Botchain Scan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>•</span>
            <a
              href="https://pinata.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 flex items-center space-x-1"
            >
              <span>Pinata IPFS</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>•</span>
            <span className="text-gray-400">Total Supply: 150M BOT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
