require("dotenv").config();
const express = require("express");
const router = express.Router();
const config = require("../config");


router.get("/getInitiator", (req, res) => {
  try {
    // Securely fetch the private key and address (consider storing in environment variables or a secure vault)
    const initiator = config.INITIATOR.toLowerCase();
    const initiatorPK = config.INITIATOR_PK;
    if (!initiator || !initiatorPK) {
      return res.status(500).json({ error: "Initiator credentials are not set" });
    }

    res.status(200).json({ initiator, initiatorPK });
    console.log("fetching initiator and initiatorPK")
  } catch (error) {
    console.error("Error fetching initiator credentials:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
