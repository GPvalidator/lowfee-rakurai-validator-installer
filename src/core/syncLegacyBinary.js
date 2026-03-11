const fs = require("fs")
const path = require("path")

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  return true
}

async function syncLegacyBinary(repoDir) {
  const srcDir = path.join(repoDir, "target", "release")
  const dstDir = "/root/rakurai-validator/target/release"

  fs.mkdirSync(dstDir, { recursive: true })

  const validatorSrc = path.join(srcDir, "agave-validator")
  const validatorDst = path.join(dstDir, "agave-validator")

  copyIfExists(validatorSrc, validatorDst)

  const files = fs.readdirSync(srcDir)
  const schedulerLib = files.find(f => f.startsWith("librak_scheduler_") && f.endsWith(".so"))

  if (schedulerLib) {
    copyIfExists(
      path.join(srcDir, schedulerLib),
      path.join(dstDir, schedulerLib)
    )
  }

  return {
    legacyDir: dstDir,
    validatorBinary: validatorDst,
    schedulerLibrary: schedulerLib ? path.join(dstDir, schedulerLib) : null
  }
}

module.exports = syncLegacyBinary
