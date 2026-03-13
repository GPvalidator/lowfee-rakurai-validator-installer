const fs = require("fs")
const path = require("path")
const run = require("../utils/run")

const WORKDIR = "/opt/lowfee-rakurai"
const REPO = path.join(WORKDIR, "rakurai-validator")

function normalizeReleaseBranch(version) {
  if (!version) {
    throw new Error("Rakurai version is required")
  }

  if (version.startsWith("release/")) {
    return version
  }

  return `release/${version}`
}

function getRakuraiActivationBinary(repoDir) {
  return path.join(
    repoDir,
    "rakurai_programs",
    "release",
    "downloads",
    "rakurai-activation"
  )
}

async function setupRakuraiRepo(version) {
  console.log("Preparing Rakurai repository")

  if (!fs.existsSync(WORKDIR)) {
    fs.mkdirSync(WORKDIR, { recursive: true })
  }

  const releaseBranch = normalizeReleaseBranch(version)

  if (fs.existsSync(path.join(REPO, ".git"))) {
    console.log("Repository already exists → updating")

    await run("git", ["fetch", "--all", "--tags"], { cwd: REPO })
    await run("git", ["reset", "--hard"], { cwd: REPO })
    await run("git", ["clean", "-fd"], { cwd: REPO })
  } else {
    console.log("Cloning Rakurai repository")

    await run("git", [
      "clone",
      "--recurse-submodules",
      "https://github.com/rakurai-io/rakurai-validator.git",
      REPO
    ])
  }

  console.log("Checking out release branch:", releaseBranch)

  await run("git", ["checkout", releaseBranch], { cwd: REPO })

  // Rakurai docs mention this cleanup may be needed on older cloned states
  try {
    await run("git", ["rm", "--cached", "core/src/banking_stage/rakurai_scheduler"], { cwd: REPO })
  } catch {
    // ignore if not needed
  }

  await run("git", ["submodule", "sync", "--recursive"], { cwd: REPO })
  await run("git", ["submodule", "update", "--init", "--recursive"], { cwd: REPO })

  const rakuraiActivationBinary = getRakuraiActivationBinary(REPO)

  console.log("Rakurai repository ready:", REPO)

  if (!fs.existsSync(rakuraiActivationBinary)) {
    console.log("")
    console.log("Expected Rakurai CLI binary was not found:")
    console.log(rakuraiActivationBinary)
    console.log("")
    throw new Error(
      "Rakurai CLI setup failed. rakurai-activation was not found after clone/checkout/submodule update."
    )
  }

  try {
    fs.chmodSync(rakuraiActivationBinary, 0o755)
  } catch {}

  console.log("Found rakurai-activation binary:", rakuraiActivationBinary)

  return REPO
}

module.exports = setupRakuraiRepo
