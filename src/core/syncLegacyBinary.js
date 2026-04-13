const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

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

  // copy agave-validator
  const validatorSrc = path.join(srcDir, "agave-validator")
  const validatorDst = path.join(dstDir, "agave-validator")

  if (copyIfExists(validatorSrc, validatorDst)) {
    fs.chmodSync(validatorDst, 0o755)
    console.log("Validator binary synced:", validatorDst)
  } else {
    console.log("WARNING: agave-validator not found in", srcDir)
  }

  // copy ALL scheduler .so files (not just one)
  const files = fs.readdirSync(srcDir)
  let copiedSo = null

  for (const f of files) {
    if (f.startsWith("librak_scheduler_") && f.endsWith(".so")) {
      const src = path.join(srcDir, f)
      const dst = path.join(dstDir, f)
      fs.copyFileSync(src, dst)
      fs.chmodSync(dst, 0o755)
      console.log("Scheduler library synced:", dst)
      copiedSo = dst
    }
  }

  if (!copiedSo) {
    console.log("WARNING: No scheduler .so found in", srcDir)
  }

  // register both library paths so agave-validator can find the scheduler
  try {
    const ldConf = [
      dstDir,
      path.join(repoDir, "target", "release")
    ].join("\n") + "\n"

    fs.writeFileSync("/etc/ld.so.conf.d/rakurai.conf", ldConf)
    execSync("ldconfig")
    console.log("ldconfig updated with rakurai library paths")
  } catch (err) {
    console.log("Warning: could not register library path:", err.message)
  }

  return {
    legacyDir: dstDir,
    validatorBinary: validatorDst,
    schedulerLibrary: copiedSo
  }
}

module.exports = syncLegacyBinary
