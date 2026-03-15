const run = require("../utils/run")

async function installDeps() {

  console.log("Installing dependencies...")

  await run("apt-get", ["update", "-y"])

  await run("apt-get", [
    "install", "-y",
    "curl",
    "jq",
    "git",
    "build-essential",
    "pkg-config",
    "libssl-dev",
    "libudev-dev",
    "libclang-dev"
    "llvm",
    "clang",
    "make",
    "cmake",
    "gcc",
    "g++",
    "tar",
    "unzip",
    "ca-certificates",
    "protobuf-compiler"
  ])

}

module.exports = installDeps
