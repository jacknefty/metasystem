import { expect } from "chai";
import { ethers } from "hardhat";
import { LOOPToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LOOPToken", function () {
  let token: LOOPToken;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const LOOPToken = await ethers.getContractFactory("LOOPToken");
    token = await LOOPToken.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await token.name()).to.equal("LOOP");
      expect(await token.symbol()).to.equal("LOOP");
    });

    it("Should start with zero supply", async function () {
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Root Commitment", function () {
    it("Should allow owner to commit root", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
      await expect(token.commitRoot(root))
        .to.emit(token, "RootCommitted");
      // Verify root was recorded
      expect(await token.rootTimestamp(root)).to.be.greaterThan(0);
    });

    it("Should reject duplicate root", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
      await token.commitRoot(root);
      await expect(token.commitRoot(root)).to.be.revertedWith("Root exists");
    });

    it("Should reject non-owner commit", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
      await expect(token.connect(user).commitRoot(root)).to.be.reverted;
    });
  });

  describe("Minting", function () {
    it("Should mint with valid proof (single leaf)", async function () {
      const amount = ethers.parseEther("100");

      // Single leaf tree: leaf is root
      const leaf = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [user.address, amount])
      );
      const root = leaf;
      const proof: string[] = [];
      const index = 0;

      await token.commitRoot(root);

      await expect(token.connect(user).mint(root, leaf, proof, index, amount))
        .to.emit(token, "CreditMinted")
        .withArgs(user.address, amount, leaf);

      expect(await token.balanceOf(user.address)).to.equal(amount);
    });

    it("Should reject unknown root", async function () {
      const amount = ethers.parseEther("100");
      const leaf = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [user.address, amount])
      );
      const root = leaf;

      await expect(
        token.connect(user).mint(root, leaf, [], 0, amount)
      ).to.be.revertedWith("Unknown root");
    });

    it("Should reject double claim", async function () {
      const amount = ethers.parseEther("100");
      const leaf = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [user.address, amount])
      );
      const root = leaf;

      await token.commitRoot(root);
      await token.connect(user).mint(root, leaf, [], 0, amount);

      await expect(
        token.connect(user).mint(root, leaf, [], 0, amount)
      ).to.be.revertedWith("Already claimed");
    });

    it("Should reject invalid leaf (wrong address)", async function () {
      const amount = ethers.parseEther("100");

      // Leaf for owner, but user tries to claim
      const leaf = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [owner.address, amount])
      );
      const root = leaf;

      await token.commitRoot(root);

      await expect(
        token.connect(user).mint(root, leaf, [], 0, amount)
      ).to.be.revertedWith("Invalid leaf");
    });

    it("Should reject invalid leaf (wrong amount)", async function () {
      const correctAmount = ethers.parseEther("100");
      const wrongAmount = ethers.parseEther("200");

      const leaf = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [user.address, correctAmount])
      );
      const root = leaf;

      await token.commitRoot(root);

      await expect(
        token.connect(user).mint(root, leaf, [], 0, wrongAmount)
      ).to.be.revertedWith("Invalid leaf");
    });
  });

  describe("Proof Verification", function () {
    it("Should verify two-leaf tree", async function () {
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");

      const leaf1 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [user.address, amount1])
      );
      const leaf2 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256"], [owner.address, amount2])
      );

      // Root = hash(leaf1 + leaf2)
      const root = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [leaf1, leaf2])
      );

      await token.commitRoot(root);

      // User claims with leaf2 as proof
      await token.connect(user).mint(root, leaf1, [leaf2], 0, amount1);
      expect(await token.balanceOf(user.address)).to.equal(amount1);

      // Owner claims with leaf1 as proof
      await token.connect(owner).mint(root, leaf2, [leaf1], 1, amount2);
      expect(await token.balanceOf(owner.address)).to.equal(amount2);
    });
  });

  async function getBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp;
  }
});
