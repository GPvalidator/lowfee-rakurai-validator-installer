const inquirer = require("inquirer")

async function chooseInstallMode(preset) {
  if (preset) {
    const allowed = ["scratch", "existing", "build"]

    if (!allowed.includes(preset)) {
      throw new Error(`Invalid install mode preset: ${preset}`)
    }

    return preset
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
