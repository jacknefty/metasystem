import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying LOOPToken with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const LOOPToken = await ethers.getContractFactory("LOOPToken");
  const token = await LOOPToken.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("LOOPToken deployed to:", address);

  // Save deployment info
  const deployment = {
    address,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    timestamp: Date.now(),
  };

  const outPath = join(__dirname, "..", "deployments", `${deployment.network}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment info saved to:", outPath);

  // Also save to parent project for bridge integration
  const bridgePath = join(__dirname, "..", "..", ".contract-address");
  writeFileSync(bridgePath, address);
  console.log("Contract address saved for bridge:", bridgePath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
