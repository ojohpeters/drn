const app = express();
module.exports = app;
module.exports.handler = serverless(app); // Required for Vercel
