// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LOOPCredits
 * @notice ERC-1155 tokens for recursive value accounting
 * @dev tokenId encodes scope level:
 *   - tokenId 0 = network LOOP (fungible across all)
 *   - tokenId = uint256(daoAddress) = DAO-scoped credits
 *   - tokenId = uint256(keccak256(dao, contextId)) = context-scoped credits
 *
 * Credits are minted at context level via Merkle proof, can be exchanged
 * up the recursion (context → DAO → network) but not down.
 */
contract LOOPCredits is ERC1155, Ownable {
    /// @notice Merkle roots committed by operator
    mapping(bytes32 => uint256) public roots;

    /// @notice Leaves that have been claimed
    mapping(bytes32 => bool) public claimed;

    /// @notice Emitted when a new root is committed
    event RootCommitted(bytes32 indexed root, uint256 timestamp);

    /// @notice Emitted when tokens are minted from a credit
    event CreditMinted(
        address indexed to,
        uint256 indexed tokenId,
        uint256 amount,
        bytes32 indexed leaf
    );

    /// @notice Emitted when credits are exchanged up the recursion
    event ExchangedUp(
        address indexed holder,
        uint256 indexed fromTokenId,
        uint256 indexed toTokenId,
        uint256 amount
    );

    constructor() ERC1155("") Ownable(msg.sender) {}

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
     * @param tokenId The token ID (encodes scope)
     * @param amount The amount to mint
     */
    function mint(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 index,
        uint256 tokenId,
        uint256 amount
    ) external {
        require(roots[root] != 0, "Unknown root");
        require(!claimed[leaf], "Already claimed");

        // Verify the leaf encodes the correct tokenId and amount for msg.sender
        bytes32 expectedLeaf = keccak256(abi.encodePacked(msg.sender, tokenId, amount));
        require(leaf == expectedLeaf, "Invalid leaf");

        require(verifyProof(leaf, proof, index, root), "Invalid proof");

        claimed[leaf] = true;
        _mint(msg.sender, tokenId, amount, "");

        emit CreditMinted(msg.sender, tokenId, amount, leaf);
    }

    /**
     * @notice Exchange credits up the recursion hierarchy
     * @dev Context → DAO → Network (tokenId 0)
     *      Exchange rate is 1:1. τ is factored at credit creation time.
     * @param fromTokenId The token to burn (must not be 0)
     * @param toTokenId The token to mint (must be parent scope or 0)
     * @param amount The amount to exchange
     */
    function exchangeUp(
        uint256 fromTokenId,
        uint256 toTokenId,
        uint256 amount
    ) external {
        require(fromTokenId != 0, "Already network level");
        require(
            toTokenId == 0 || toTokenId == getParentTokenId(fromTokenId),
            "Can only exchange to parent scope"
        );

        _burn(msg.sender, fromTokenId, amount);
        _mint(msg.sender, toTokenId, amount, "");

        emit ExchangedUp(msg.sender, fromTokenId, toTokenId, amount);
    }

    /**
     * @notice Simplified exchange directly to network LOOP
     * @param fromTokenId The token to burn
     * @param amount The amount to exchange
     */
    function exchangeToNetwork(uint256 fromTokenId, uint256 amount) external {
        require(fromTokenId != 0, "Already network level");

        _burn(msg.sender, fromTokenId, amount);
        _mint(msg.sender, 0, amount, "");

        emit ExchangedUp(msg.sender, fromTokenId, 0, amount);
    }

    /**
     * @notice Get the parent token ID for a scoped token
     * @dev For context tokens, returns DAO token. For DAO tokens, returns 0.
     *      This is a simplified version - full implementation would need
     *      a registry mapping context tokenIds to their DAO.
     * @param tokenId The token to get parent for
     * @return The parent token ID (0 for network level)
     */
    function getParentTokenId(uint256 tokenId) public pure returns (uint256) {
        // tokenId 0 = network (no parent)
        // tokenId = uint256(daoAddress) = DAO level → parent is 0
        // tokenId = uint256(keccak256(dao, context)) = context level → parent is DAO
        //
        // We can't derive parent from hash alone, so for now:
        // - If tokenId fits in 160 bits (address), it's a DAO token → parent is 0
        // - Otherwise it's a context token → caller must specify parent
        //
        // This is a simplification. Full version needs on-chain registry.
        if (tokenId <= type(uint160).max) {
            return 0; // DAO token → parent is network
        }
        // Context tokens need explicit parent specification
        return 0;
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

    /**
     * @notice Compute token ID for a DAO
     * @param daoAddress The DAO's Ethereum address
     * @return tokenId The token ID for this DAO
     */
    function computeDaoTokenId(address daoAddress) external pure returns (uint256) {
        return uint256(uint160(daoAddress));
    }

    /**
     * @notice Compute token ID for a context within a DAO
     * @param daoAddress The DAO's Ethereum address
     * @param contextId The context identifier (bytes32 hash of context ID string)
     * @return tokenId The token ID for this context
     */
    function computeContextTokenId(
        address daoAddress,
        bytes32 contextId
    ) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(daoAddress, contextId)));
    }
}
