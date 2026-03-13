const path = require("path")
const fs = require("fs")
const { execSync } = require("child_process")
const inquirer = require("inquirer")
const run = require("../utils/run")

const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const RESET = "\x1b[0m"

function getRakuraiActivationBinary(repoDir) {

  try {
    const fromPath = execSync("command -v rakurai-activation", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()

    if (fromPath && fs.existsSync(fromPath)) {
      return fromPath
    }
  } catch {}

  const candidates = []

  if (repoDir) {
    candidates.push(
      path.join(repoDir, "rakurai_programs", "release", "downloads", "rakurai-activation"),
      path.join(repoDir, "target", "release", "rakurai-activation")
    )
  }

  candidates.push(
    "/opt/lowfee-rakurai/rakurai-validator/rakurai_programs/release/downloads/rakurai-activation",
    "/opt/lowfee-rakurai/rakurai-validator/target/release/rakurai-activation",
    "/root/rakurai-validator/rakurai_programs/release/downloads/rakurai-activation",
    "/root/rakurai-validator/target/release/rakurai-activation"
  )

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const found = execSync(
      `find /opt /root /home -type f -name rakurai-activation 2>/dev/null | head -n 1`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim()

    if (found && fs.existsSync(found)) {
      return found
    }
  } catch {}

  throw new Error(
    "rakurai-activation binary not found. Make sure Rakurai repo is cloned correctly."
  )
}

async function askRaaMode() {
  const ans = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Rakurai Activation Account (RAA)",
      choices: [
        { name: "Use existing RAA", value: "existing" },
        { name: "Create new RAA", value: "create" }
      ]
    }
  ])
  return ans.mode
}

function extractBase58(str) {
  const m = str.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)
  return m ? m[0] : ""
}

async function findExistingRaa({ programId, identityPubkey, identityKeypair, repoDir }) {

  const rakuraiActivationBinary = getRakuraiActivationBinary(repoDir)

  console.log("Using rakurai-activation:", rakuraiActivationBinary)
  console.log("Checking existing Rakurai Activation Account...")

  try {
    const out = await run(
      rakuraiActivationBinary,
      ["-p", programId, "show", "-i", identityPubkey, "--keypair", identityKeypair, "-um"],
      { capture: true }
    )

    const found = extractBase58(out || "")
    if (found) {
      console.log("Existing RAA:", found)
      return found
    }

  } catch {}

  console.log("No existing RAA found.")
  return ""
}

async function createNewRaa({
  programId,
  rpcUrl,
  identityKeypair,
  votePubkey,
  commissionBps,
  repoDir
}) {

  const rakuraiActivationBinary = getRakuraiActivationBinary(repoDir)

  console.log("Using rakurai-activation:", rakuraiActivationBinary)
  console.log("Creating Rakurai Activation Account...")

  try {

    const out = await run(
      rakuraiActivationBinary,
      [
        "-p", programId,
        "init",
        "--commission_bps", String(commissionBps),
        "--vote_pubkey", votePubkey,
        "--keypair", identityKeypair,
        "--url", rpcUrl
      ],
      { capture: true }
    )

    const found = extractBase58(out || "")

    if (!found) {
      throw new Error("RAA init succeeded but no pubkey detected in output")
    }

    console.log("RAA created:", found)
    return found

  } catch (err) {

    const msg = String(err?.stderr || err?.message || "")

    if (msg.includes("Unauthorized signer")) {

      console.log("")
      console.log(`${RED}❌ Unauthorized signer${RESET}`)
      console.log(`${YELLOW}WARNING:${RESET} this vote account may belong to a different validator identity.`)
      console.log("Please select another vote account.")
      console.log("")

      throw new Error("VOTE_MISMATCH")
    }

    if (/already in use|already exists/i.test(msg)) {
      console.log("RAA appears to already exist. Trying to recover it...")
      return ""
    }

    if (/insufficient funds|rent/i.test(msg)) {
      throw new Error("Insufficient SOL to create the Rakurai Activation Account.")
    }

    throw err
  }
}

async function signRaa({ raaPubkey, identityKeypair }) {

  console.log("Signing RAA offchain message...")

  const out = await run(
    "solana",
    ["sign-offchain-message", raaPubkey, "--keypair", identityKeypair],
    { capture: true }
  )

  const sig = (out || "").match(/[1-9A-HJ-NP-Za-km-z]{60,120}/)?.[0] || ""

  if (!sig) {
    throw new Error("Could not parse signature")
  }

  console.log("Signature captured")

  return sig
}

async function resolveRaa(ctx) {

  const mode = await askRaaMode()

  let raaPubkey = ""

  if (mode === "existing") {

    raaPubkey = await findExistingRaa(ctx)

    if (!raaPubkey) {
      console.log("No existing RAA was found for this identity.")
      console.log("Falling back to create a new RAA...")
    }
  }

  while (!raaPubkey) {

    try {

      raaPubkey = await createNewRaa(ctx)

    } catch (err) {

      if (err.message === "VOTE_MISMATCH") {
        throw err
      }

      throw err
    }

    if (!raaPubkey) {

      raaPubkey = await findExistingRaa(ctx)

      if (!raaPubkey) {
        throw new Error("Failed to recover or create a Rakurai Activation Account.")
      }
    }
  }

  const signature = await signRaa({
    raaPubkey,
    identityKeypair: ctx.identityKeypair
  })

  return {
    raaPubkey,
    signature
  }
}

module.exports = resolveRaa
