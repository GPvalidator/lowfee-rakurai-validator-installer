const getArgs = require("./utils/args")
const startSystemdService = require("./core/startSystemdService")
const generateSystemdService = require("./core/generateSystemdService")
const inquirer = require("inquirer")
const generateValidatorScript = require("./core/generateValidatorScript")
const createAuthorizedWithdrawer = require("./core/authorizedWithdrawer")
const createVoteAccount = require("./core/createVoteAccount")
const chooseInstallMode = require("./core/installMode")
const banner = require("./banner")
const { step } = require("./ui")
const patchValidatorScript = require("./core/validatorPatch")
const setupScheduler = require("./core/scheduler")
const resolveRaa = require("./core/raa")
const chooseCommission = require("./core/commission")
const detectVoteAccount = require("./core/voteAccount")
const detectValidatorKeypair = require("./core/validatorKeypair")
const detectOS = require("./core/os")
const installDeps = require("./core/dependencies")
const installRust = require("./core/rust")
const installSolana = require("./core/solana")
const chooseCluster = require("./core/cluster")
const chooseRakuraiVersion = require("./core/rakuraiVersion")
const setupRakuraiRepo = require("./core/rakuraiRepo")

const args = getArgs()

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

  if (installMode === "scratch") {
    step("🔑", "Create Validator Identity")
    const validator = await detectValidatorKeypair()

    step("🏦", "Create Authorized Withdrawer")
    const withdrawer = await createAuthorizedWithdrawer()

    step("🗳️", "Create Vote Account")
    const vote = await createVoteAccount({
      validatorKeypair: validator.identityKeypair,
      withdrawerKeypair: withdrawer.withdrawerKeypair,
      rpcUrl: cluster.rpc
    })

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

    step("📝", "Generate Validator Start Script")
    const validatorScript = await generateValidatorScript({
      cluster: cluster.cluster,
      validatorBinary: `${repo}/target/release/agave-validator`,
      validatorKeypair: validator.identityKeypair,
      voteKeypair: vote.voteKeypair,
      programId: cluster.program,
      rewardProgramId: cluster.rewardProgram,
      rewardsAuthority: "H21wFgN53ghjDq5N9QhraAiPn1tRVYkobySj55unXLEj"
    })

    step("🧩", "Generate systemd service")
    const systemdService = await generateSystemdService({
      validatorScriptPath: validatorScript.scriptPath || "/root/solana.sh"
    })

    const startAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "startService",
        message: "Start and enable solana.service now?",
        default: false
      }
    ])

    if (startAnswer.startService) {
      step("🚦", "Start systemd service")
      await startSystemdService(systemdService.servicePath || "/etc/systemd/system/solana.service")
    }

    console.log("--------------------------------------------------")
    console.log("Configuration summary:")
    console.log({
      installMode,
      cluster,
      rakuraiVersion,
      repo,
      validator,
      withdrawer,
      vote,
      commission,
      raa,
      scheduler,
      validatorScript,
      systemdService
    })
    console.log("--------------------------------------------------")

    console.log("")
    console.log("Keypair locations:")
    if (validator?.identityKeypair) {
      console.log(`Validator keypair: ${validator.identityKeypair}`)
    }
    if (validator?.identitySeedPath) {
      console.log(`Validator recovery seed: ${validator.identitySeedPath}`)
    }
    if (withdrawer?.withdrawerKeypair) {
      console.log(`Authorized withdrawer keypair: ${withdrawer.withdrawerKeypair}`)
    }
    if (withdrawer?.withdrawerSeedPath) {
      console.log(`Authorized withdrawer recovery seed: ${withdrawer.withdrawerSeedPath}`)
    }
    if (vote?.voteKeypair) {
      console.log(`Vote keypair: ${vote.voteKeypair}`)
    }
    if (vote?.voteSeedPath) {
      console.log(`Vote recovery seed: ${vote.voteSeedPath}`)
    }
    console.log("")

    console.log("Recovery folder:")
    console.log(`${process.cwd()}/data/recovery`)
    console.log("")

    console.log("Validator start script:")
    console.log(validatorScript?.scriptPath || "/root/solana.sh")
    console.log("")

    console.log("Systemd service:")
    console.log(systemdService?.servicePath || "/etc/systemd/system/solana.service")
    console.log("")

    console.log("Rakurai agave-validator binary:")
    console.log(`${repo}/target/release/agave-validator`)
    console.log("")

    console.log("IMPORTANT:")
    console.log("Backup the recovery files before running the validator.")
    console.log("")

    console.log("Next step:")
    console.log("Run these commands:")
    console.log("systemctl daemon-reload")
    console.log("systemctl enable solana.service")
    console.log("systemctl start solana.service")
    console.log("")
    return
  }

  step("🔑", "Detect Validator Identity")
  const validator = await detectValidatorKeypair()

  step("🗳️", "Detect Vote Account")
  let vote = await detectVoteAccount()

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
        step("🗳️", "Detect Vote Account")
        vote = await detectVoteAccount({
          warningMessage: "This vote account may belong to a different validator identity. Please choose another vote account."
        })
        continue
      }

      if (err.message === "VOTE_NOT_FOUND") {
        step("🗳️", "Detect Vote Account")
        vote = await detectVoteAccount({
          warningMessage: "This vote account does not exist on the selected Solana cluster. Please choose another vote account."
        })
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

  if (installMode === "existing") {
    step("🧩", "Patch Validator Start Script")
    await patchValidatorScript({
      programId: cluster.program,
      rewardProgramId: cluster.rewardProgram,
      rewardsAuthority: "H21wFgN53ghjDq5N9QhraAiPn1tRVYkobySj55unXLEj"
    })
  }

  console.log("--------------------------------------------------")
  console.log("Configuration summary:")
  console.log({
    installMode,
    cluster,
    rakuraiVersion,
    repo,
    validator,
    vote,
    commission,
    raa,
    scheduler
  })
  console.log("--------------------------------------------------")

  console.log("")
  console.log("Keypair locations:")
  if (validator?.identityKeypair) {
    console.log(`Validator keypair: ${validator.identityKeypair}`)
  }
  if (validator?.identitySeedPath) {
    console.log(`Validator recovery seed: ${validator.identitySeedPath}`)
  }
  if (vote?.voteKeypair) {
    console.log(`Vote keypair: ${vote.voteKeypair}`)
  }
  if (vote?.voteSeedPath) {
    console.log(`Vote recovery seed: ${vote.voteSeedPath}`)
  }
  console.log("")

  console.log("Recovery folder:")
  console.log(`${process.cwd()}/data/recovery`)
  console.log("")

  console.log("Rakurai agave-validator binary:")
  console.log(`${repo}/target/release/agave-validator`)
  console.log("")

  if (installMode === "existing") {
    console.log("Next step:")
    console.log("Replace or restart your validator using the Rakurai build above.")
    console.log("")
  }

  if (installMode === "build") {
    console.log("Next step:")
    console.log("Rakurai binary has been built only.")
    console.log("No validator script or systemd service was modified.")
    console.log("")
  }
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
