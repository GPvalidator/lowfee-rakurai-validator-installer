const fs = require("fs")
const path = require("path")
const waitForFunding = require("./core/waitForFunding")
const syncLegacyBinary = require("./core/syncLegacyBinary")
const getArgs = require("./utils/args")
const startSystemdService = require("./core/startSystemdService")
const generateSystemdService = require("./core/generateSystemdService")
const inquirer = require("inquirer")
const generateValidatorScript = require("./core/generateValidatorScript")

const {
  setupVoteAndWithdrawer,
  selectVoteAccount,
  selectAuthorizedWithdrawer,
  buildCreateVoteAccountCommand
} = require("./core/voteAccount")

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

const INSTALLER_DATA_DIR = path.resolve(process.cwd(), "data")
const DEFAULT_SOLANA_KEYGEN = "/root/.local/share/solana/install/active_release/bin/solana-keygen"
const DEFAULT_SOLANA_CLI = "/root/.local/share/solana/install/active_release/bin/solana"
const DEFAULT_BASE_DIR = "/root/solana/lfv"
const DEFAULT_REWARDS_AUTHORITY = "H21wFgN53ghjDq5N9QhraAiPn1tRVYkobySj55unXLEj"

/*
========================================================
EXISTING MODE VOTE ACCOUNT HANDLING
========================================================
*/

async function promptExistingVoteAccount({
  keypairDir,
  validator,
  cluster,
  warningMessage = null
}) {
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

  if (!vote.needsCreateOnChain) {
    return {
      votePubkey: vote.votePubkey,
      voteKeypair: vote.voteKeypair
    }
  }

  console.log("")
  console.log("A new vote account was selected. It will now be created on-chain.")
  console.log("")

  const withdrawer = await selectAuthorizedWithdrawer({
    solanaKeygen: DEFAULT_SOLANA_KEYGEN,
    searchDir: keypairDir,
    outputDir: keypairDir,
    validatorPubkey: validator.identityPubkey,
    validatorKeypair: validator.identityKeypair
  })

  if (!withdrawer.authorizedWithdrawerKeypair) {
    throw new Error(
      "Creating a new vote account on-chain requires an authorized withdrawer keypair file."
    )
  }

  await waitForFunding({
    solanaPath: DEFAULT_SOLANA_CLI,
    solanaKeygen: DEFAULT_SOLANA_KEYGEN,
    rpcUrl: cluster.rpc,
    feePayerKeypair: validator.identityKeypair,
    minimumRequiredSol: 0.05,
    pollIntervalMs: 5000
  })

  const createVoteAccountCommand = buildCreateVoteAccountCommand({
    solanaPath: DEFAULT_SOLANA_CLI,
    voteKeypair: vote.voteKeypair,
    validatorKeypair: validator.identityKeypair,
    authorizedWithdrawerKeypair: withdrawer.authorizedWithdrawerKeypair,
    commission: 0,
    rpcUrl: cluster.rpc
  })

  console.log("")
  console.log(`${BOLD}${CYAN}Creating vote account on-chain...${RESET}`)
  console.log("")

  const { execSync } = require("child_process")

  try {
    execSync(createVoteAccountCommand, { stdio: "inherit" })
  } catch (err) {
    console.log("")
    console.error("Failed to create vote account on-chain.")
    console.error("You may need to run the following command manually:")
    console.log("")
    console.log(createVoteAccountCommand)
    console.log("")
    throw err
  }

  console.log("")
  console.log(`${BOLD}${CYAN}Vote account successfully created on-chain.${RESET}`)
  console.log("")

  return {
    votePubkey: vote.votePubkey,
    voteKeypair: vote.voteKeypair
  }
}


/*
========================================================
MAIN
========================================================
*/

async function main() {

  await banner()

  step("🧭", "Select Installation Mode")
  const installMode = await chooseInstallMode(args.mode || null)

  console.log("Starting Low Fee Rakurai Installer")

/*
========================================================
BUILD MODE — minimal: only check, compile, replace
========================================================
*/

if (installMode === "build") {
  const { execSync } = require("child_process")

  step("🔍", "Check Prerequisites")

  // check rust
  let hasRust = false
  try {
    const rustVer = execSync("rustc --version", { encoding: "utf8" }).trim()
    console.log("Rust:", rustVer)
    hasRust = true
  } catch {
    console.log(`${BOLD}\x1b[31mERROR: Rust not found.${RESET} Install it with: curl https://sh.rustup.rs -sSf | sh -s -- -y`)
  }

  // check cargo
  let cargoPath = "cargo"
  try {
    execSync("cargo --version", { encoding: "utf8" })
  } catch {
    if (fs.existsSync(process.env.HOME + "/.cargo/bin/cargo")) {
      cargoPath = process.env.HOME + "/.cargo/bin/cargo"
    } else {
      console.log(`${BOLD}\x1b[31mERROR: cargo not found.${RESET}`)
      hasRust = false
    }
  }

  // check build deps
  const requiredCmds = ["git", "make", "cc"]
  for (const cmd of requiredCmds) {
    try {
      execSync(`command -v ${cmd}`, { stdio: "ignore" })
    } catch {
      console.log(`${BOLD}\x1b[33mWARNING: ${cmd} not found.${RESET} Install build-essential.`)
    }
  }

  // check libclang
  let libclangDir = ""
  try {
    const found = execSync('find /usr -type f -name "libclang*.so*" 2>/dev/null | head -n 1', { encoding: "utf8" }).trim()
    if (found) libclangDir = path.dirname(found)
  } catch {}
  if (!libclangDir) {
    console.log(`${BOLD}\x1b[31mERROR: libclang not found.${RESET} Install libclang-dev.`)
  }

  if (!hasRust || !libclangDir) {
    throw new Error("Missing build prerequisites. Install them and try again.")
  }

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

  step("🔑", "Detect Validator Identity")
  const validator = await detectValidatorKeypair()

  step("📡", "Detect Rakurai Activation Account")
  const keypairDir = path.dirname(validator.identityKeypair)

  // detect vote account for RAA lookup
  const { selectVoteAccount } = require("./core/voteAccount")
  const vote = await selectVoteAccount({
    solanaKeygen: DEFAULT_SOLANA_KEYGEN,
    searchDir: keypairDir,
    outputDir: keypairDir
  })

  const raa = await resolveRaa({
    programId: cluster.program,
    rpcUrl: cluster.rpc,
    identityKeypair: validator.identityKeypair,
    identityPubkey: validator.identityPubkey,
    votePubkey: vote.votePubkey,
    commissionBps: 0,
    repoDir: repo
  })

  step("⚙️", "Download Scheduler & Build Validator")

  const os = await detectOS()

  const setupScheduler = require("./core/scheduler")
  await setupScheduler({
    osKey: os.osKey,
    cluster: cluster.cluster,
    repoDir: repo,
    raaPubkey: raa.raaPubkey,
    signature: raa.signature,
    rakuraiVersion
  })

  step("📦", "Detect & Replace Validator Binary")

  // 1) detect systemd services and start scripts
  const detectedChoices = []
  for (const svc of ["solana.service", "sol.service", "validator.service"]) {
    try {
      const unit = execSync(`systemctl cat ${svc}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      const execMatch = unit.match(/ExecStart=(\S+)/)
      if (execMatch && execMatch[1]) {
        detectedChoices.push({
          name: `${svc} → ${execMatch[1]}`,
          value: { type: "service", serviceName: svc, script: execMatch[1] }
        })
      }
    } catch {}
  }

  // scan for .sh scripts
  const scriptNames = ["solana.sh", "validator.sh", "start-validator.sh"]
  const scriptDirs = ["/root", "/home", "/opt"]
  for (const dir of scriptDirs) {
    for (const name of scriptNames) {
      try {
        const found = execSync(`find "${dir}" -maxdepth 4 -type f -name "${name}" 2>/dev/null`, {
          encoding: "utf8"
        }).trim()
        if (found) {
          for (const f of found.split("\n").filter(Boolean)) {
            // skip if already detected via systemd
            if (detectedChoices.some(c => c.value.script === f)) continue
            detectedChoices.push({
              name: `Script: ${f}`,
              value: { type: "script", script: f }
            })
          }
        }
      } catch {}
    }
  }

  detectedChoices.push({
    name: "Enter path manually",
    value: { type: "manual" }
  })

  // 2) ask user which one
  let serviceScript = null
  let serviceName = null
  let activeBinaryPath = null

  const { target } = await inquirer.prompt([
    {
      type: "list",
      name: "target",
      message: `${BOLD}${CYAN}Select your validator start script / service:${RESET}`,
      choices: detectedChoices
    }
  ])

  if (target.type === "manual") {
    const { manualPath } = await inquirer.prompt([
      {
        type: "input",
        name: "manualPath",
        message: `${BOLD}${CYAN}Enter path to your validator start script or binary:${RESET}`,
        validate: input => {
          if (!input || !input.trim()) return "Path required"
          if (!fs.existsSync(input.trim())) return "File not found"
          return true
        }
      }
    ])
    serviceScript = manualPath.trim()
  } else {
    serviceScript = target.script
    serviceName = target.serviceName || null
  }

  // 3) read the script to find the binary path
  if (serviceScript && fs.existsSync(serviceScript)) {
    console.log(`Reading: ${serviceScript}`)
    try {
      const script = fs.readFileSync(serviceScript, "utf8")
      // find the active (uncommented) exec line with agave-validator
      const lines = script.split("\n")
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith("#")) continue  // skip commented lines
        const binMatch = trimmed.match(/(?:exec\s+)?(\S*agave-validator)/)
        if (binMatch && fs.existsSync(binMatch[1])) {
          activeBinaryPath = binMatch[1]
          break
        }
      }
      if (activeBinaryPath) {
        console.log(`Active binary: ${activeBinaryPath}`)
      }
    } catch {}
  }

  const newBinary = path.join(repo, "target", "release", "agave-validator")
  const legacyBinary = await syncLegacyBinary(repo)

  // only replace the binary the user's script actually uses — never touch other binaries
  const updatedPaths = [legacyBinary.validatorBinary]

  if (activeBinaryPath && activeBinaryPath !== newBinary && activeBinaryPath !== legacyBinary.validatorBinary) {
    try {
      fs.copyFileSync(newBinary, activeBinaryPath)
      fs.chmodSync(activeBinaryPath, 0o755)
      updatedPaths.push(activeBinaryPath)
      console.log("Updated active binary:", activeBinaryPath)
    } catch (err) {
      console.log(`Could not update active binary ${activeBinaryPath}: ${err.message}`)
    }
  }

  // get compiled version
  let compiledVersion = ""
  try {
    compiledVersion = execSync(`"${legacyBinary.validatorBinary}" --version`, { encoding: "utf8" }).trim()
  } catch {}

  console.log("")
  console.log("══════════════════════════════════════════════════════")
  console.log("✅ Rakurai build completed.")
  console.log("══════════════════════════════════════════════════════")
  console.log("")
  console.log(`${BOLD}${CYAN}Rakurai version:${RESET}    ${rakuraiVersion}`)
  if (compiledVersion) {
    console.log(`${BOLD}${CYAN}Binary version:${RESET}     ${compiledVersion}`)
  }
  console.log(`${BOLD}${CYAN}Cluster:${RESET}            ${cluster.cluster}`)
  console.log(`${BOLD}${CYAN}Identity:${RESET}           ${validator.identityPubkey}`)
  console.log("")
  console.log(`${BOLD}${CYAN}Binary updated at:${RESET}`)
  for (const p of updatedPaths) {
    console.log(`  ${p}`)
  }
  if (legacyBinary.schedulerLibrary) {
    console.log(`${BOLD}${CYAN}Scheduler library:${RESET}  ${legacyBinary.schedulerLibrary}`)
  }
  if (serviceScript) {
    console.log(`${BOLD}${CYAN}Start script:${RESET}       ${serviceScript}`)
  }
  if (serviceName) {
    console.log("")
    console.log(`${BOLD}\x1b[33mRestart your validator to use the new binary:${RESET}`)
    console.log(`  systemctl restart ${serviceName}`)
  }
  console.log("")
  return
}

/*
========================================================
FULL INSTALL / UPDATE — common setup
========================================================
*/

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
  step("📁", "Select Keypair Storage Directory")

  const storageDirAnswer = await inquirer.prompt([
    {
      type: "list",
      name: "storage",
      message: "Where do you want to store validator keypairs?",
      choices: [
        {
          name: `Installer data directory (recommended) (${INSTALLER_DATA_DIR})`,
          value: INSTALLER_DATA_DIR
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

  // use the actual validator keypair directory as the real source of truth
  keypairDir = path.dirname(validator.identityKeypair)

  step("🏦", "Setup Vote Account & Authorized Withdrawer")
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
  commissionBps: commission.commissionBps,
  repoDir: repo
})

    step("⚙️", "Install Scheduler")

    const scheduler = await setupScheduler({
      osKey: os.osKey,
      cluster: cluster.cluster,
      repoDir: repo,
      raaPubkey: raa.raaPubkey,
      rewardsAuthority: DEFAULT_REWARDS_AUTHORITY,
      programId: cluster.program,
      rewardProgramId: cluster.rewardProgram,
      signature: raa.signature,
      rakuraiVersion
    })

    step("📦", "Sync validator binary to legacy path")

    const legacyBinary = await syncLegacyBinary(repo)

    step("📝", "Generate Validator Start Script")

    const validatorScript = await generateValidatorScript({
      cluster: cluster.cluster,
      validatorBinary: legacyBinary.validatorBinary,
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
      legacyBinary: legacyBinary.validatorBinary,
      identityKeypair: validator.identityKeypair,
      identityPubkey: validator.identityPubkey,
      voteKeypair: vote.voteKeypair,
      votePubkey: vote.votePubkey,
      commissionBps: commission.commissionBps,
      raaPubkey: raa.raaPubkey,
      rewardsAuthority: DEFAULT_REWARDS_AUTHORITY,
      programId: cluster.program,
      rewardProgramId: cluster.rewardProgram
    })

    step("🧩", "Generate Systemd Service")

    const service = await generateSystemdService({
      installMode,
      cluster,
      scriptPath: validatorScript.scriptPath,
      repoDir: repo
    })

    const { startNow } = await inquirer.prompt([
      {
        type: "confirm",
        name: "startNow",
        message: `${BOLD}${CYAN}Start validator service now?${RESET}`,
        default: true
      }
    ])

    if (startNow) {
      step("▶️", "Start Systemd Service")
      await startSystemdService(service)
    }

    console.log("")
    console.log("══════════════════════════════════════════════════════")
    console.log("✅ Low Fee Rakurai scratch installation completed.")
    console.log("══════════════════════════════════════════════════════")
    console.log("")
    console.log(`${BOLD}${CYAN}Validator identity:${RESET}  ${validator.identityPubkey}`)
    console.log(`${BOLD}${CYAN}Vote account:${RESET}       ${vote.votePubkey}`)
    console.log("")
    console.log(`${BOLD}${CYAN}Keypair files:${RESET}`)
    console.log(`  Identity:    ${validator.identityKeypair}`)
    if (vote.voteKeypair) console.log(`  Vote:        ${vote.voteKeypair}`)
    console.log("")
    if (validator.identitySeedPath || fs.existsSync("/var/lib/solana/recovery")) {
      console.log(`${BOLD}${CYAN}Recovery seeds:${RESET}`)
      try {
        const recoveryFiles = fs.readdirSync("/var/lib/solana/recovery").filter(f => f.endsWith("-seed.txt") || f.endsWith(".txt"))
        for (const f of recoveryFiles) {
          console.log(`  /var/lib/solana/recovery/${f}`)
        }
      } catch {}
      console.log("")
      console.log(`${BOLD}\x1b[33mIMPORTANT: Back up your recovery seeds and keypair files immediately.${RESET}`)
      console.log(`${BOLD}\x1b[33mStore them securely offline. If lost, your validator cannot be recovered.${RESET}`)
    }
    console.log("")
    if (validatorScript?.scriptPath) console.log(`${BOLD}${CYAN}Validator script:${RESET}   ${validatorScript.scriptPath}`)
    if (service?.servicePath) console.log(`${BOLD}${CYAN}Systemd service:${RESET}    ${service.servicePath}`)
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

let vote = await promptExistingVoteAccount({
  keypairDir,
  validator,
  cluster
})

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
      commissionBps: commission.commissionBps,
      repoDir: repo
    })

    break
  } catch (err) {
    if (err.message === "VOTE_MISMATCH") {
      vote = await promptExistingVoteAccount({
        keypairDir,
        validator,
        cluster,
        warningMessage: "Vote account belongs to another validator."
      })
      continue
    }

    if (err.message === "VOTE_NOT_FOUND") {
      vote = await promptExistingVoteAccount({
        keypairDir,
        validator,
        cluster,
        warningMessage: "Vote account does not exist on selected cluster."
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
  signature: raa.signature,
  rakuraiVersion
})

step("🩹", "Patch Validator Script")
await patchValidatorScript({
  programId: cluster.program,
  rewardProgramId: cluster.rewardProgram,
  rewardsAuthority: DEFAULT_REWARDS_AUTHORITY
})

console.log("")
console.log("══════════════════════════════════════════════════════")
console.log("✅ Installation completed.")
console.log("══════════════════════════════════════════════════════")
console.log("")
console.log(`${BOLD}${CYAN}Validator identity:${RESET}  ${validator.identityPubkey}`)
console.log(`${BOLD}${CYAN}Vote account:${RESET}       ${vote.votePubkey}`)
console.log("")
if (fs.existsSync("/var/lib/solana/recovery")) {
  try {
    const recoveryFiles = fs.readdirSync("/var/lib/solana/recovery").filter(f => f.endsWith(".txt"))
    if (recoveryFiles.length > 0) {
      console.log(`${BOLD}${CYAN}Recovery seeds:${RESET}`)
      for (const f of recoveryFiles) {
        console.log(`  /var/lib/solana/recovery/${f}`)
      }
      console.log("")
      console.log(`${BOLD}\x1b[33mIMPORTANT: Back up your recovery seeds and keypair files immediately.${RESET}`)
      console.log(`${BOLD}\x1b[33mStore them securely offline. If lost, your validator cannot be recovered.${RESET}`)
      console.log("")
    }
  } catch {}
}
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
