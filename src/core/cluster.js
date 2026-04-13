const inquirer = require("inquirer")

const clusters = {
  "mainnet-beta": {
    cluster: "mainnet-beta",
    rpc: "https://api.mainnet-beta.solana.com",
    program: "rAKACC6Qw8HYa87ntGPRbfYEMnK2D9JVLsmZaKPpMmi",
    rewardProgram: "RAkd1EJg45QQHeuXy7JEWBhdNvsd64Z5PbZJWQT96iB"
  },
  testnet: {
    cluster: "testnet",
    rpc: "https://api.testnet.solana.com",
    program: "pmQHMpnpA534JmxEdwY3ADfwDBFmy5my3CeutHM2QTt",
    rewardProgram: "A37zgM34Q43gKAxBWQ9zSbQRRhjPqGK8jM49H7aWqNVB"
  }
}

async function chooseCluster(preset) {
  if (preset && clusters[preset]) {
    console.log("Cluster selected:", preset)
    return clusters[preset]
  }

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "cluster",
      message: "Select Solana cluster",
      choices: [
        { name: "mainnet-beta", value: clusters["mainnet-beta"] },
        { name: "testnet", value: clusters.testnet }
      ]
    }
  ])

  console.log("Cluster selected:", answer.cluster.cluster)
  return answer.cluster
}

module.exports = chooseCluster
