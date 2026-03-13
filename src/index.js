const path = require("path")
const waitForFunding = require("./core/waitForFunding")
const syncLegacyBinary = require("./core/syncLegacyBinary")
const getArgs = require("./utils/args")
const startSystemdService = require("./core/startSystemdService")
const generateSystemdService = require("./core/generateSystemdService")
const inquirer = require("inquirer")
const generateValidatorScript = require("./core/generateValidatorScript")
const { setupVoteAndWithdrawer, selectVoteAccount } = require("./core/voteAccount")
const chooseInstallMode = require("./core/installMode")
const banner = require("./banner")
const { step } = require("./ui")
const patchValidatorScript = require("./core/validatorPatch")
const setupScheduler = require("./core/scheduler")
const resolveRaa = require("./core/raa")
const chooseCommission = require("./core/commission")
const detectValidatorKeypair = require("./core/validatorKeypair")
const detectOS = require("./core/os")
const installDeps = require("./core/dependencies")
const installRust = require("./core/rust")
const installSolana = require("./core/solana")
const chooseCluster = require("./core/cluster")
const chooseRakuraiVersion = require("./core/rakuraiVersion")
const setupRakuraiRepo = require("./core/rakuraiRepo")
const pickDirectory = require("./utils/dirPicker")

const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

const args = getArgs()

const DEFAULT_SOLANA_KEYGEN = "/root/.local/share/solana/install/active_release/bin/solana-keygen"
const DEFAULT_SOLANA_CLI = "/root/.local/share/solana/install/active_release/bin/solana"
const DEFAULT_BASE_DIR = "/root/solana/lfv"
const DEFAULT_REWARDS_AUTHORITY = "H21wFgN53ghjDq5N9QhraAiPn1tRVYkobySj55unXLEj"

async function promptExistingVoteAccount(keypairDir, warningMessage = null) {
  if (warningMessage) {
    console.log("")
    console.log(warningMessage)
    console.log("")
  }

  const vote = await selectVoteAccount({
    solanaKeygen: DEFAULT_SOLANA_KEYGEN,
    searchDir: keypairDir,
    outputDir: keypairDir
  })

  return {
    votePubkey: vote.votePubkey,
    voteKeypair: vote.voteKeypair
  }
}
async function main() {
  await banner()

  step("🧭", "Select Installation Mode")
  const installMode = args.mode || await chooseInstallMode()

  console.log("Starting Low Fee Rakurai Installer")

  step("🖥️", "Detect Operating System")
  const os = await detectOS()

  step("📦", "Install System Dependencies")
  await installDeps()

  step("🦀", "Install Rust")
  await installRust()

  step("☀️", "Install Solana CLI")
  await installSolana()

  step("🌐", "Select Solana Cluster")
  const cluster = args.cluster
    ? await chooseCluster(args.cluster)
    : await chooseCluster()

  step("🚀", "Select Rakurai Version")
  const rakuraiVersion = args["rakurai-version"]
    ? await chooseRakuraiVersion(args["rakurai-version"])
    : await chooseRakuraiVersion()

  step("📂", "Setup Rakurai Repository")
  const repo = await setupRakuraiRepo(rakuraiVersion)

  /*
  ========================================================
  SCRATCH MODE
  ========================================================
  */


if (installMode === "scratch") {
  step("📁", "Select Keypair Storage Directory")

  const storageDirAnswer = await inquirer.prompt([
    {
      type: "list",
      name: "storage",
      message: "Where do you want to store validator keypairs?",
      choices: [
        {
          name: "Installer data directory (recommended)",
          value: "/root/node-script/lowfee-rakurai-installer/data"
        },
        {
          name: "Validator directory",
          value: "/root/solana/lfv"
        },
        {
          name: "Browse filesystem",
          value: "__BROWSE__"
        }
      ]
    }
  ])

  let keypairDir = storageDirAnswer.storage

  if (keypairDir === "__BROWSE__") {
    keypairDir = await pickDirectory("/root")
  }

  console.log("")
  console.log("Selected keypair directory:", keypairDir)
  console.log("")

  step("🔑", "Create Validator Identity")
  const validator = await detectValidatorKeypair()

  step("🏦", "Setup Vote Account & Authorized Withdrawer")

  keypairDir = path.dirname(validator.identityKeypair)

  const voteSetup = await setupVoteAndWithdrawer({
    solanaKeygen: DEFAULT_SOLANA_KEYGEN,
    solanaPath: DEFAULT_SOLANA_CLI,
    rpcUrl: cluster.rpc,
    searchDir: keypairDir,
    outputDir: keypairDir,
    validatorPubkey: validator.identityPubkey,
    validatorKeypair: validator.identityKeypair,
    commission: 0
  })

  if (!voteSetup.voteKeypair) {
    throw new Error(
      "Scratch mode requires a local vote account keypair."
    )
  }

  if (voteSetup.createVoteAccountCommandReady && voteSetup.createVoteAccountCommand) {
    console.log("")
    console.log(`${BOLD}${CYAN}Creating vote account on-chain...${RESET}`)
    console.log("")

    await waitForFunding({
      solanaPath: DEFAULT_SOLANA_CLI,
      solanaKeygen: DEFAULT_SOLANA_KEYGEN,
      rpcUrl: cluster.rpc,
      feePayerKeypair: validator.identityKeypair,
      minimumRequiredSol: 0.05,
      pollIntervalMs: 5000
    })

    const { execSync } = require("child_process")

    try {
      execSync(voteSetup.createVoteAccountCommand, { stdio: "inherit" })
    } catch (err) {
      console.log("")
      console.error("Failed to create vote account on-chain.")
      console.error("You may need to run the following command manually:")
      console.log("")
      console.log(voteSetup.createVoteAccountCommand)
      console.log("")
      throw err
    }

    console.log("")
    console.log(`${BOLD}${CYAN}Vote account successfully created on-chain.${RESET}`)
    console.log("")
  } else if (voteSetup.needsCreateVoteAccountOnChain) {
    throw new Error(
      voteSetup.createVoteAccountCommandReason ||
        "Vote account still needs to be created on-chain before continuing."
    )
  }

  const vote = {
    votePubkey: voteSetup.votePubkey,
    voteKeypair: voteSetup.voteKeypair
  }

    step("💰", "Select Rakurai Commission")

    const commission = args["commission-bps"]
      ? await chooseCommission(args["commission-bps"])
      : await chooseCommission()

    step("📡", "Configure Rakurai Activation Account")

    const raa = await resolveRaa({
      programId: cluster.program,
      rpcUrl: cluster.rpc,
      identityKeypair: validator.identityKeypair,
      identityPubkey: validator.identityPubkey,
      votePubkey: vote.votePubkey,
      commissionBps: commission.commissionBps
    })

    step("⚙️", "Install Scheduler")

    const scheduler = await setupScheduler({
      osKey: os.osKey,
      cluster: cluster.cluster,
      repoDir: repo,
      raaPubkey: raa.raaPubkey,
      signature: raa.signature
    })

    step("📦", "Sync validator binary to legacy path")

    const legacyBinary = await syncLegacyBinary(repo)

    step("📝", "Generate Validator Start Script")

    const validatorScript = await generateValidatorScript({
      cluster: cluster.cluster,
      validatorBinary: legacyBinary,
      validatorKeypair: validator.identityKeypair,
      voteKeypair: vote.voteKeypair,
      programId: cluster.program,
      rewardProgramId: cluster.rewardProgram,
      rewardsAuthority: DEFAULT_REWARDS_AUTHORITY
    })

    step("🩹", "Patch Validator Script")

    await patchValidatorScript({
      scriptPath: validatorScript.scriptPath,
      installMode,
      cluster,
      repoDir: repo,
      legacyBinary,
      identityKeypair: validator.identityKeypair,
      identityPubkey: validator.identityPubkey,
      voteKeypair: vote.voteKeypair,
      votePubkey: vote.votePubkey,
      commissionBps: commission.commissionBps,
      raaPubkey: raa.raaPubkey
    })

    step("🧩", "Generate Systemd Service")

    const service = await generateSystemdService({
      installMode,
      cluster,
      scriptPath: validatorScript.scriptPath
    })

    const { startNow } = await inquirer.prompt([
      {
        type: "confirm",
        name: "startNow",
        message: "Start validator service now?",
        default: true
      }
    ])

    if (startNow) {
      step("▶️", "Start Systemd Service")
      await startSystemdService(service.serviceName)
    }

    console.log("")
    console.log("✅ Low Fee Rakurai scratch installation completed.")
    console.log("")
    return
  }

  /*
  ========================================================
  EXISTING MODE
  ========================================================
  */

  step("🔑", "Detect Validator Identity")

  const validator = await detectValidatorKeypair()

  step("🗳️", "Select Vote Account")

const keypairDir = path.dirname(validator.identityKeypair)
let vote = await promptExistingVoteAccount(keypairDir)

  step("💰", "Select Rakurai Commission")

  const commission = args["commission-bps"]
    ? await chooseCommission(args["commission-bps"])
    : await chooseCommission()

  step("📡", "Configure Rakurai Activation Account")

  let raa

  while (true) {
    try {

      raa = await resolveRaa({
        programId: cluster.program,
        rpcUrl: cluster.rpc,
        identityKeypair: validator.identityKeypair,
        identityPubkey: validator.identityPubkey,
        votePubkey: vote.votePubkey,
        commissionBps: commission.commissionBps
      })

      break

    } catch (err) {

      if (err.message === "VOTE_MISMATCH") {

       vote = await promptExistingVoteAccount(
  keypairDir,
  "Vote account belongs to another validator."
)

        continue
      }

      if (err.message === "VOTE_NOT_FOUND") {

       vote = await promptExistingVoteAccount(
  keypairDir,
  "Vote account does not exist on selected cluster."
)

        continue
      }

      throw err
    }
  }

  step("⚙️", "Install Scheduler")

  const scheduler = await setupScheduler({
    osKey: os.osKey,
    cluster: cluster.cluster,
    repoDir: repo,
    raaPubkey: raa.raaPubkey,
    signature: raa.signature
  })

  step("🩹", "Patch Validator Script")

  await patchValidatorScript({
    programId: cluster.program,
    rewardProgramId: cluster.rewardProgram,
    rewardsAuthority: DEFAULT_REWARDS_AUTHORITY
  })

  console.log("")
  console.log("Installation completed.")
  console.log("")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
