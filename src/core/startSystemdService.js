const { execSync } = require("child_process")
const run = require("../utils/run")

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function startSystemdService(ctx) {
  if (!ctx?.servicePath) {
    console.log("No systemd service path found. Skipping automatic start.")
    return null
  }

  const serviceName = ctx.servicePath.split("/").pop()

  console.log("Reloading systemd...")
  await run("systemctl", ["daemon-reload"])

  console.log(`Enabling ${serviceName}...`)
  await run("systemctl", ["enable", serviceName])

  console.log(`Starting ${serviceName}...`)
  await run("systemctl", ["start", serviceName])

  console.log("Waiting 3 seconds before checking status...")
  await sleep(3000)

  // systemctl status returns exit code 3 when service is not running
  // use execSync to avoid execa treating it as a fatal error
  console.log("")
  console.log("Service status:")
  try {
    execSync(`systemctl status ${serviceName} --no-pager -l`, { stdio: "inherit" })
  } catch {
    // exit code 3 = service inactive/failed, still show output (already printed via stdio inherit)
    console.log("")
    console.log("WARNING: Service may not be running correctly. Check logs with:")
    console.log(`  journalctl -u ${serviceName} --no-pager -n 50`)
  }

  return {
    serviceName
  }
}

module.exports = startSystemdService
