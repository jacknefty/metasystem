// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MetaSystemIdentity
 * @notice On-chain verification of identity contracts
 *
 * Stores merkle root of all identity.md documents.
 * Enables verification that an identity contract was part of the attested set.
 */
contract MetaSystemIdentity is Ownable {
    bytes32 public charterCid;
    bytes32 public identityRoot;

    mapping(bytes32 => bool) public closed;

    event CharterUpdated(bytes32 indexed cid);
    event IdentityRootUpdated(bytes32 indexed root);
    event IdentityAttested(bytes32 indexed id, bytes32 docHash);
    event Closed(bytes32 indexed id);

    constructor(bytes32 _charterCid) Ownable(msg.sender) {
        charterCid = _charterCid;
    }

    function updateCharter(bytes32 _cid) external onlyOwner {
        charterCid = _cid;
        emit CharterUpdated(_cid);
    }

    function updateIdentityRoot(bytes32 _root) external onlyOwner {
        identityRoot = _root;
        emit IdentityRootUpdated(_root);
    }

    function verifyIdentity(
        bytes32 id,
        bytes32 docHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(id, docHash));
        return MerkleProof.verify(proof, identityRoot, leaf);
    }

    function close(bytes32 id) external onlyOwner {
        require(!closed[id], "Already closed");
        closed[id] = true;
        emit Closed(id);
    }

    function isClosed(bytes32 id) external view returns (bool) {
        return closed[id];
    }
}
