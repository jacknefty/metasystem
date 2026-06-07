// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LOOPToken
 * @notice ERC20 token minted against verified work proofs
 * @dev Merkle tree verification for off-chain credit claims
 */
contract LOOPToken is ERC20, Ownable {
    /// @notice Merkle roots committed by operator
    mapping(bytes32 => uint256) public roots;

    /// @notice Leaves that have been claimed
    mapping(bytes32 => bool) public claimed;

    /// @notice Emitted when a new root is committed
    event RootCommitted(bytes32 indexed root, uint256 timestamp);

    /// @notice Emitted when tokens are minted from a credit
    event CreditMinted(address indexed to, uint256 amount, bytes32 indexed leaf);

    constructor() ERC20("LOOP", "LOOP") Ownable(msg.sender) {}

    /**
     * @notice Commit a new merkle root
     * @param root The merkle root to commit
     */
    function commitRoot(bytes32 root) external onlyOwner {
        require(roots[root] == 0, "Root exists");
        roots[root] = block.timestamp;
        emit RootCommitted(root, block.timestamp);
    }

    /**
     * @notice Mint tokens for a verified credit
     * @param root The merkle root containing this credit
     * @param leaf The credit leaf hash
     * @param proof The merkle proof
     * @param index The leaf index in the tree
     * @param amount The amount to mint (in wei)
     */
    function mint(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 index,
        uint256 amount
    ) external {
        require(roots[root] != 0, "Unknown root");
        require(!claimed[leaf], "Already claimed");

        // Verify the leaf encodes the correct amount for msg.sender
        bytes32 expectedLeaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(leaf == expectedLeaf, "Invalid leaf");

        require(verifyProof(leaf, proof, index, root), "Invalid proof");

        claimed[leaf] = true;
        _mint(msg.sender, amount);

        emit CreditMinted(msg.sender, amount, leaf);
    }

    /**
     * @notice Verify a merkle proof
     * @param leaf The leaf to verify
     * @param proof The proof path
     * @param index The leaf index
     * @param root The expected root
     * @return True if proof is valid
     */
    function verifyProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 index,
        bytes32 root
    ) public pure returns (bool) {
        bytes32 current = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            if (index % 2 == 0) {
                current = keccak256(abi.encodePacked(current, proof[i]));
            } else {
                current = keccak256(abi.encodePacked(proof[i], current));
            }
            index = index / 2;
        }

        return current == root;
    }

    /**
     * @notice Check if a root has been committed
     * @param root The root to check
     * @return timestamp When the root was committed (0 if never)
     */
    function rootTimestamp(bytes32 root) external view returns (uint256) {
        return roots[root];
    }

    /**
     * @notice Check if a leaf has been claimed
     * @param leaf The leaf to check
     * @return True if already claimed
     */
    function isClaimed(bytes32 leaf) external view returns (bool) {
        return claimed[leaf];
    }
}
