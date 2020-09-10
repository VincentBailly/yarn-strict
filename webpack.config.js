module.exports = {
  target: "node",
  mode: "production",
  entry: "./lib/index.js",
  output: {
    path: __dirname,
    filename: "index.js",
    library: "yarn-strict",
    libraryTarget: "umd"
  }
}
