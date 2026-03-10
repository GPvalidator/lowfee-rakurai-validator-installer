const inquirer = require("inquirer")

async function chooseCommission() {
  const choices = [
    { name: "0 bps (0%)", value: 0 },
    { name: "100 bps (1%)", value: 100 },
    { name: "200 bps (2%)", value: 200 },
    { name: "500 bps (5%)", value: 500 },
    { name: "1000 bps (10%)", value: 1000 },
    { name: "1500 bps (15%)", value: 1500 },
    { name: "2000 bps (20%)", value: 2000 },
    { name: "3000 bps (30%)", value: 3000 },
    { name: "5000 bps (50%)", value: 5000 },
    { name: "7500 bps (75%)", value: 7500 },
    { name: "10000 bps (100%)", value: 10000 },
    { name: "Manual", value: "manual" }
  ]

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "commission",
      message: "Select Rakurai commission",
      choices
    }
  ])

  let commissionBps = answer.commission

  if (commissionBps === "manual") {
    while (true) {
      const manual = await inquirer.prompt([
        {
          type: "input",
          name: "bps",
          message: "Enter commission in basis points (0-10000):"
        }
      ])

      const parsed = Number(manual.bps)

      if (
        Number.isInteger(parsed) &&
        parsed >= 0 &&
        parsed <= 10000
      ) {
        commissionBps = parsed
        break
      }

      console.log("Invalid value. Must be an integer between 0 and 10000.")
    }
  }

  const percent = (commissionBps / 100).toFixed(2)

  console.log(`Commission selected: ${commissionBps} bps (${percent}%)`)

  return {
    commissionBps,
    percent
  }
}

module.exports = chooseCommission

