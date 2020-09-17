require("fs").mkdirSync("node_modules", { recursive: true })
require("fs").writeFileSync(
  require("path").join("node_modules", "pre-install"),
  "Okay"
);
