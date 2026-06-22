const { existsSync } = require("node:fs");
const { join } = require("node:path");

const STACK_SIGNALS = {
  node: "package.json",
  java: "pom.xml",
  "java-gradle": "build.gradle",
  rust: "Cargo.toml",
  python: "pyproject.toml",
  go: "go.mod",
};

function detect(target) {
  const stacks = Object.entries(STACK_SIGNALS)
    .filter(([, file]) => existsSync(join(target, file)))
    .map(([name]) => name);
  return {
    target,
    stacks,
    hasClaudeDir: existsSync(join(target, ".claude")),
    hasGit: existsSync(join(target, ".git")),
  };
}

if (require.main === module) {
  const i = process.argv.indexOf("--target");
  const target = i >= 0 ? process.argv[i + 1] : process.cwd();
  console.log(JSON.stringify(detect(target), null, 2));
}
module.exports = { detect, STACK_SIGNALS };
