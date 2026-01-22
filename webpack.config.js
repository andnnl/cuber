/* eslint-disable */
const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => ({
  entry: {
    index: "./src/index.ts",
  },
  devtool: argv.mode === "production" ? false : "eval-cheap-module-source-map",
  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "[name].[chunkhash].js",
    globalObject: "this",
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
      },
      {
        test: /\.(html|svg)?$/,
        loader: "text-loader",
      },
      {
        test: /\.(png|woff(2)?|eot|ttf)(\?[a-z0-9=\.]+)?$/,
        type: "asset/inline",
      },
      {
        test: /\.wasm$/,
        type: "javascript/auto",
      },
    ],
  },
  resolve: {
    alias: {
      vue$: "vue/dist/vue.esm.js",
      '/cube_cross_solve.js': path.resolve(__dirname, './public/cube_cross_solve.js'),
    },
    extensions: ["*", ".js", ".ts", ".json"],
  },
  performance: {
    hints: false,
  },
  optimization: {
    minimize: argv.mode === "production",
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
        parallel: true,
      }),
    ],
    splitChunks: {
      chunks: "initial",
      name: "vendor",
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      favicon: "./resource/icon.png",
      filename: "index.html",
      template: "./resource/index.html",
    }),
    new CleanWebpackPlugin({
      dry: argv.mode !== "production",
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "public/cube_cross_solve.js", to: "cube_cross_solve.js" },
        { from: "public/cube_cross_solve_bg.wasm", to: "cube_cross_solve_bg.wasm" },
      ],
    }),
  ],
});
