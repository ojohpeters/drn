const { ethers, BigNumber } = require("ethers");
const axios = require("axios");
const config = require("../config")

let transactionInProgress = false;

const sendToTelegram = async (message) => {
  try {
    const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error("Telegram credentials are missing in the environment variables");
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message });
  } catch (error) {
    console.error("Failed to send message to Telegram:", error.message);
  }
};

const ensureSufficientGasBalance = async (address, provider, chainId) => {
  try {
    const balance = await provider.getBalance(address);

    let gasPrice = ethers.utils.parseUnits("5", "gwei");
    let gasLimit = BigNumber.from(21000);

    if (provider instanceof ethers.providers.JsonRpcProvider) {
      const feeData = await provider.getFeeData();
      gasPrice = feeData.gasPrice || gasPrice;
    }

    if ([10, 42161].includes(chainId)) {
      gasLimit = BigNumber.from(50000);
    }

    const gasEstimate = gasPrice.mul(gasLimit);

    if (balance.lt(gasEstimate)) {
      const gasDeficit = gasEstimate.sub(balance);

      const errorMessage = `⚠️ Insufficient gas balance for address ${address} on chain ${chainId}. 
Current balance: ${ethers.utils.formatEther(balance)} ETH. 
Estimated required gas cost: ${ethers.utils.formatEther(gasEstimate)} ETH. 
Please add at least ${ethers.utils.formatEther(gasDeficit)} ETH to cover transaction fees.`;

      console.error(errorMessage);
      await sendToTelegram(errorMessage);
      throw new Error(errorMessage);
    }

    console.log(
      `✅ Sufficient gas balance for address ${address} on chain ${chainId}: ${ethers.utils.formatEther(
        balance
      )} ETH. Estimated gas cost: ${ethers.utils.formatEther(gasEstimate)} ETH.`
    );
  } catch (error) {
    const errorMessage = `Error checking gas balance for address ${address} on chain ${chainId}: ${
      error.message || "Unknown error"
    }`;
    console.error(errorMessage);
    await sendToTelegram(errorMessage);
    throw error;
  }
};

const sendTransactionWithDynamicGas = async (chainId, provider, transaction) => {
  if (transactionInProgress) {
    console.log("Transaction already in progress, skipping.");
    return;
  }

  transactionInProgress = true;

  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("5", "gwei");

    const tx = {
      ...transaction,
      gasPrice,
    };

    const signer = provider.getSigner();
    const response = await signer.sendTransaction(tx);
    await response.wait();

    console.log("Transaction successful:", response.hash);
  } catch (error) {
    console.error("Error sending transaction:", error.message || error);
    throw error;
  } finally {
    transactionInProgress = false;
  }
};

module.exports = {
  ensureSufficientGasBalance,
  sendTransactionWithDynamicGas,
};
