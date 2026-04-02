const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: {
      popup: "./src/index.jsx",
      "service-worker": "./src/service-worker.js",
      content: "./src/content/index.js",
      "content-dandh": "./src/content/dandh.js",
      "content-raincoast": "./src/content/raincoast.js",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: [
                ["@babel/preset-env", { targets: "last 2 Chrome versions" }],
                ["@babel/preset-react", { runtime: "automatic" }],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".js", ".jsx"],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: "[name].css" }),
      new HtmlWebpackPlugin({
        template: "./src/popup.html",
        filename: "popup.html",
        chunks: ["popup"],
      }),
      new CopyPlugin({
        patterns: [
          { from: "manifest.json", to: "manifest.json" },
          { from: "icons", to: "icons" },
        ],
      }),
    ],
    devtool: isProd ? false : "cheap-module-source-map",
    performance: false,
  };
};
