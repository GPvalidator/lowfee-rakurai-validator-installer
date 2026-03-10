const fs = require("fs")
const path = require("path")
const run = require("../utils/run")

const WORKDIR = "/opt/lowfee-rakurai"
const REPO = path.join(WORKDIR, "rakurai-validator")

async function setupRakuraiRepo(version) {

  console.log("Preparing Rakurai repository")

  if (!fs.existsSync(WORKDIR)) {
    fs.mkdirSync(WORKDIR, { recursive: true })
  }

  if (fs.existsSync(path.join(REPO, ".git"))) {

    console.log("Repository already exists → updating")

    await run("git", ["fetch", "--all", "--tags"], { cwd: REPO })

    await run("git", ["reset", "--hard"], { cwd: REPO })

    await run("git", ["clean", "-fd"], { cwd: REPO })

  } else {

    console.log("Cloning Rakurai repository")

    await run("git", [
      "clone",
      "https://github.com/rakurai-io/rakurai-validator.git",
      REPO
    ])
  }

  console.log("Checking out version:", version)

  await run("git", ["checkout", version], { cwd: REPO })

  await run("git", ["submodule", "sync", "--recursive"], { cwd: REPO })

  await run("git", ["submodule", "update", "--init", "--recursive"], { cwd: REPO })

  console.log("Rakurai repository ready:", REPO)

  return REPO
}

module.exports = setupRakuraiRepo
