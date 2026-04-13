const { execa } = require("execa")

async function run(cmd, args = [], opts = {}) {

  const options = {}

  if(opts.cwd){
    options.cwd = opts.cwd
  }

  if(opts.env){
    options.env = opts.env
  }

  if(opts.capture){
    const { stdout } = await execa(cmd, args, options)
    return stdout
  }

  await execa(cmd, args, { stdio: "inherit", ...options })

}

module.exports = run
