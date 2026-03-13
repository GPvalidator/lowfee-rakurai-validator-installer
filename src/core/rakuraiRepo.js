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

  await run("git", ["submodule", "sync", "--recursive"], { cwd: REPO })
  await run("git", ["submodule", "update", "--init", "--recursive"], { cwd: REPO })

  const rakuraiActivationBinary = getRakuraiActivationBinary(REPO)

  console.log("Rakurai repository ready:", REPO)

  if (fs.existsSync(rakuraiActivationBinary)) {
    console.log("Found rakurai-activation binary:", rakuraiActivationBinary)
  } else {
    console.log("WARNING: rakurai-activation binary not found yet at:", rakuraiActivationBinary)
    console.log("The selected Rakurai release may not have downloaded the CLI artifacts in the expected location.")
  }

  return REPO
}

module.exports = setupRakuraiRepo
