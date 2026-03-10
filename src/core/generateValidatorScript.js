const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")

const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

async function generateValidatorScript(ctx) {

  console.log("")
  console.log("Generating validator startup script")
  console.log("")

  const defaultScriptPath = "/root/solana.sh"
  const defaultLedgerPath = "/root/ledger"
  const defaultAccountsPath = "/root/ledger/accounts"
  const defaultLogPath = "/root/ledger/solana.log"
  const defaultRpcPort = "8899"
  const defaultDynamicPortRange = "8000-8025"

  const mainnetBlockEngineUrl = "https://amsterdam.mainnet.block-engine.jito.wtf"
  const mainnetShredReceiverAddress = "74.118.140.240:1002"

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "scriptPath",
      message: `${BOLD}${CYAN}Enter validator script path (ENTER = /root/solana.sh):${RESET}`,
      default: defaultScriptPath
    },
    {
      type: "input",
      name: "ledgerPath",
      message: `${BOLD}${CYAN}Enter ledger path:${RESET}`,
      default: defaultLedgerPath
    },
    {
      type: "input",
      name: "accountsPath",
      message: `${BOLD}${CYAN}Enter accounts path:${RESET}`,
      default: defaultAccountsPath
    },
    {
      type: "input",
      name: "logPath",
      message: `${BOLD}${CYAN}Enter log path:${RESET}`,
      default: defaultLogPath
    },
    {
      type: "input",
      name: "rpcPort",
      message: `${BOLD}${CYAN}Enter RPC port:${RESET}`,
      default: defaultRpcPort
    },
    {
      type: "input",
      name: "dynamicPortRange",
      message: `${BOLD}${CYAN}Enter dynamic port range:${RESET}`,
      default: defaultDynamicPortRange
    },
    {
      type: "input",
      name: "tipCommission",
      message: `${BOLD}${CYAN}Jito tip commission (bps, default = 0 recommended):${RESET}`,
      default: "0",
      validate: input => {
        const n = Number(input)
        if (isNaN(n) || n < 0 || n > 10000) {
          return "Enter a number between 0 and 10000"
        }
        return true
      }
    }
  ])

  const scriptPath = answers.scriptPath || defaultScriptPath
  const ledgerPath = answers.ledgerPath || defaultLedgerPath
  const accountsPath = answers.accountsPath || defaultAccountsPath
  const logPath = answers.logPath || defaultLogPath
  const rpcPort = answers.rpcPort || defaultRpcPort
  const dynamicPortRange = answers.dynamicPortRange || defaultDynamicPortRange
  const tipCommission = Number(answers.tipCommission ?? 0)

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.mkdirSync(ledgerPath, { recursive: true })
  fs.mkdirSync(accountsPath, { recursive: true })

  const entrypoints =
    ctx.cluster === "mainnet-beta"
      ? [
          "entrypoint.mainnet-beta.solana.com:8001",
          "entrypoint2.mainnet-beta.solana.com:8001",
          "entrypoint3.mainnet-beta.solana.com:8001",
          "entrypoint4.mainnet-beta.solana.com:8001",
          "entrypoint5.mainnet-beta.solana.com:8001"
        ]
      : [
          "entrypoint.testnet.solana.com:8001",
          "entrypoint2.testnet.solana.com:8001",
          "entrypoint3.testnet.solana.com:8001"
        ]

  const expectedGenesisHash =
    ctx.cluster === "mainnet-beta"
      ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      : ""

  const expectedShredVersionLine =
    ctx.cluster === "mainnet-beta"
      ? `    --expected-shred-version 50093 \\`
      : ""

  const entrypointLines = entrypoints
    .map(ep => `    --entrypoint ${ep} \\`)
    .join("\n")

  const genesisLine = expectedGenesisHash
    ? `    --expected-genesis-hash ${expectedGenesisHash} \\`
    : ""

  const content = `#!/bin/bash

exec ${ctx.validatorBinary} \\
    --identity ${ctx.validatorKeypair} \\
    --vote-account ${ctx.voteKeypair} \\
    --authorized-voter ${ctx.validatorKeypair} \\
    --ledger ${ledgerPath} \\
    --accounts ${accountsPath} \\
    --rpc-bind-address 0.0.0.0 \\
    --rpc-port ${rpcPort} \\
    --dynamic-port-range ${dynamicPortRange} \\
${entrypointLines}
${genesisLine}
${expectedShredVersionLine}
    --tip-payment-program-pubkey T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt \\
    --tip-distribution-program-pubkey 4R3gSG8BpU4t19KYj8CfnbtRpnT8gtk4dvTHxVRwc2r7 \\
    --merkle-root-upload-authority 8F4jGUmxF36vQ6yabnsxX6AQVXdKBhs8kGSUuRKSg8Xt \\
    --commission-bps ${tipCommission} \\
    --block-engine-url ${mainnetBlockEngineUrl} \\
    --shred-receiver-address ${mainnetShredReceiverAddress} \\
    --limit-ledger-size 50000000 \\
    --log ${logPath} \\
    --rewards-merkle-root-authority ${ctx.rewardsAuthority} \\
    --rakurai-activation-program-id ${ctx.programId} \\
    --reward-distribution-program-id ${ctx.rewardProgramId}
`

  fs.writeFileSync(scriptPath, content)
  fs.chmodSync(scriptPath, 0o755)

  console.log(`Validator startup script created: ${scriptPath}`)

  return {
    scriptPath,
    ledgerPath,
    accountsPath,
    logPath,
    rpcPort,
    dynamicPortRange
  }

}

module.exports = generateValidatorScript
