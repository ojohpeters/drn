require("dotenv").config();
const { ethers } = require("ethers");
const config = require("../config");




// Define RPC URLs with optional Ankr token
const BR_Private_RPC_URLs = {
  1: `https://mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Ethereum
  10: `https://optimism-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Optimism
  56: `https://bsc-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Binance Smart Chain
  137: `https://polygon-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Polygon
  // 250: `https://rpc.ankr.com/fantom${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Fantom
  43114: `https://avalanche-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Avalanche
  42161: `https://arbitrum-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Arbitrum
  8453: `https://base-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Base
  324: `https://zksync-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // zkSync Era
  369: "https://pulsechain.publicnode.com", // Pulse
  11155111: "https://sepolia.infura.io/v3/15b2a4fd999148318a366400d99bc8ce", // Sepolia
};

// Function to get the provider for a specific chainId
const getProvider = (chainId) => {
  const rpcUrl = BR_Private_RPC_URLs[chainId];
  if (!rpcUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // Log the selected RPC URL for debugging
  console.log(`Connecting to RPC URL: ${rpcUrl} for Chain ID: ${chainId}`);
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

// Load the private key securely
const INITIATOR_PK = config.INITIATOR_PK;
// Initialize the wallet using the private key
const initiatorWallet = new ethers.Wallet(INITIATOR_PK);

module.exports = { getProvider, initiatorWallet };
