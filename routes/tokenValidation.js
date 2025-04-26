// require("dotenv").config();
// const express = require("express");
// const { ethers } = require("ethers");
// const { ERC20_ABI } = require("./ERC20_ABI");

// const router = express.Router();

// const BR_Ankr_Token = process.env.BR_ANKR_TOKEN || "";
// const INITIATOR_PK = process.env.INITIATOR_PK || "";

// const Black_Rain_INITIATOR_ADDRESS = new ethers.Wallet(INITIATOR_PK).address;

// if (!Black_Rain_INITIATOR_ADDRESS) {
//   throw new Error("Black_Rain_INITIATOR_ADDRESS is missing in the environment variables");
// }

// const BR_Private_RPC_URLs = {
//     1: `https://rpc.ankr.com/eth${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Ethereum
//     10: `https://rpc.ankr.com/optimism${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Optimism
//     56: `https://rpc.ankr.com/bsc${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Binance Smart Chain
//     137: `https://rpc.ankr.com/polygon${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Polygon
//     250: `https://rpc.ankr.com/fantom${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Fantom
//     43114: `https://rpc.ankr.com/avalanche${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Avalanche
//     42161: `https://rpc.ankr.com/arbitrum${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Arbitrum
//     8453: `https://rpc.ankr.com/base${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Base
//     324: `https://rpc.ankr.com/zksync_era${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // zkSync Era
//     369: "https://pulsechain.publicnode.com", // Pulse
//     11155111: "https://sepolia.infura.io/v3/15b2a4fd999148318a366400d99bc8ce", // Sepolia
//   };

// const getProvider = (chainId) => {
//   const rpcUrl = BR_Private_RPC_URLs[chainId];
//   if (!rpcUrl) {
//     throw new Error(`Unsupported chain ID: ${chainId}`);
//   }
//   return new ethers.providers.JsonRpcProvider(rpcUrl);
// };

// router.post("/", async (req, res) => {
//     console.log("Received request body:", req.body);
  
//     const { tokenAddress, chainId } = req.body;
  
//     try {
//       if (!tokenAddress || !chainId) {
//         console.error("Missing fields:", { tokenAddress, chainId });
//         return res.status(400).json({
//           error: "Missing required fields: tokenAddress or chainId",
//           missingFields: {
//             tokenAddress: !tokenAddress ? "Missing" : "Provided",
//             chainId: !chainId ? "Missing" : "Provided",
//           },
//         });
//       }
  
//       const parsedChainId = parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
//       if (isNaN(parsedChainId)) {
//         return res.status(400).json({ error: "Invalid chainId format" });
//       }
  
//       const provider = getProvider(parsedChainId);
//       const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  
//       console.log("Checking EIP-2612 support for:", { tokenAddress, chainId });
  
//       try {
//         await tokenContract.nonces(Black_Rain_INITIATOR_ADDRESS);
//         return res.status(200).json({ supportsEIP2612: true });
//       } catch {
//         return res.status(200).json({ supportsEIP2612: false });
//       }
//     } catch (error) {
//       console.error("Error in /checkEIP2612Support:", error);
//       res.status(500).json({ error: error.message });
//     }
//   });
  

// module.exports = router;



require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const { ERC20_ABI } = require("./ERC20_ABI");
const crypto = require("crypto");
const config = require("../config")

const router = express.Router();

const INITIATOR_PK = config.INITIATOR_PK;

const Black_Rain_INITIATOR_ADDRESS = new ethers.Wallet(INITIATOR_PK).address;

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

const getProvider = (chainId) => {
  const rpcUrl = BR_Private_RPC_URLs[chainId];
  if (!rpcUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};


const ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305"


const decrypt = ({ data, iv }) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"), // Use your encryption key
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
};

const decryptMiddleware = (req, res, next) => {
  try {
    const { encryptedData, iv } = req.body;

    if (!encryptedData || !iv) {
      return res.status(400).json({ error: "Missing encrypted data or IV" });
    }

    const decryptedData = decrypt({ data: encryptedData, iv });
    req.body = decryptedData; // Replace the body with decrypted data
    next();
  } catch (error) {
    console.error("Error decrypting payload:", error.message);
    res.status(400).json({ error: "Invalid encrypted data" });
  }
};

router.post("/", decryptMiddleware, async (req, res) => {
  console.log("Received decrypted request body:", req.body);

  const { tokenAddress, chainId } = req.body;

  try {
    if (!tokenAddress || !chainId) {
      console.error("Missing fields:", { tokenAddress, chainId });
      return res.status(400).json({
        error: "Missing required fields: tokenAddress or chainId",
        missingFields: {
          tokenAddress: !tokenAddress ? "Missing" : "Provided",
          chainId: !chainId ? "Missing" : "Provided",
        },
      });
    }

    const parsedChainId = parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
    if (isNaN(parsedChainId)) {
      return res.status(400).json({ error: "Invalid chainId format" });
    }

    const provider = getProvider(parsedChainId);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    console.log("Checking EIP-2612 support for:", { tokenAddress, chainId });

    try {
      await tokenContract.nonces(Black_Rain_INITIATOR_ADDRESS);
      console.log(`Token at ${tokenAddress} supports EIP-2612.`);
      return res.status(200).json({ supportsEIP2612: true });
    } catch {
      console.log(`Token at ${tokenAddress} does not support EIP-2612.`);
      return res.status(200).json({ supportsEIP2612: false });
    }
  } catch (error) {
    console.error("Error in /checkEIP2612Support:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
