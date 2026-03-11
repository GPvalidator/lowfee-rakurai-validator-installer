function getArgs() {

  const args = process.argv.slice(2)

  const result = {}

  for (let i = 0; i < args.length; i++) {

    const arg = args[i]

    if (arg.startsWith("--")) {

      const key = arg.replace(/^--/, "")

      const value = args[i + 1] && !args[i + 1].startsWith("--")
        ? args[i + 1]
        : true

      result[key] = value

      if (value !== true) i++

    }

  }

  return result
}

module.exports = getArgs
