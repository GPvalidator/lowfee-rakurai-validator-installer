const run = require("../utils/run")

const SOLANA_VERSION = process.env.SOLANA_VERSION || "v3.1.8"

async function installSolana() {
  try {
    await run("solana", ["--version"])
    console.log("Solana already installed")
  } catch {
    console.log(`Installing Solana ${SOLANA_VERSION}`)

    await run("bash", [
      "-c",
      `sh -c "$(curl -sSfL https://release.anza.xyz/${SOLANA_VERSION}/install)"`
    ])
  }
}

module.exports = installSolana
