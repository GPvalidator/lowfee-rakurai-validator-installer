const inquirer = require("inquirer")

async function chooseInstallMode(preset) {
  if (preset) {
    // map web-generated values to internal mode names
    const aliasMap = {
      install: "scratch",
      update: "existing",
      scratch: "scratch",
      existing: "existing",
      build: "build"
    }

    const resolved = aliasMap[preset]

    if (!resolved) {
      throw new Error(`Invalid install mode preset: ${preset}`)
    }

    return resolved
  }

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "What do you want to do?",
      choices: [
        {
          name: "Install validator from scratch",
          value: "scratch"
        },
        {
          name: "Update existing validator",
          value: "existing"
        },
        {
          name: "Build Rakurai binary only",
          value: "build"
        }
      ]
    }
  ])

  return answer.mode
}

module.exports = chooseInstallMode
