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

  console.log("")
  console.log("Service status:")
  await run("systemctl", ["status", serviceName, "--no-pager", "-l"])

  if (ctx.logPath) {
    console.log("")
    console.log("Waiting 3 seconds before following logs...")
    await sleep(3000)

    console.log(`Following validator log: ${ctx.logPath}`)
    console.log("Press Ctrl+C to stop log follow.")
    await run("tail", ["-f", ctx.logPath])
  }

  return {
    serviceName,
    logPath: ctx.logPath
  }
}

module.exports = startSystemdService
