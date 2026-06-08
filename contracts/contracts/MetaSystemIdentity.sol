// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MetaSystemIdentity
 * @notice On-chain verification of identity contracts (S5)
 *
 * Stores merkle root of all identity.md documents.
 * Enables verification that an identity contract was part of the attested set.
 * References subsystem contracts for coordination, control, audit.
 */
contract MetaSystemIdentity is Ownable {
    bytes32 public charterCid;
    bytes32 public identityRoot;
    bytes32 public policyRoot;

    // Subsystem contract references
    address public coordinationContract;
    address public controlContract;
    address public auditContract;
    address public bridgeContract;

    mapping(bytes32 => bool) public closed;
    mapping(bytes32 => bytes32) public policyVersion;

    event CharterUpdated(bytes32 indexed cid);
    event IdentityRootUpdated(bytes32 indexed root);
    event PolicyRootUpdated(bytes32 indexed root);
    event IdentityAttested(bytes32 indexed id, bytes32 docHash);
    event PolicyUpdated(bytes32 indexed scopeId, bytes32 version);
    event Closed(bytes32 indexed id);
    event SubsystemRegistered(string indexed name, address indexed addr);

    constructor(bytes32 _charterCid) Ownable(msg.sender) {
        charterCid = _charterCid;
    }

    function registerSubsystem(string calldata name, address addr) external onlyOwner {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        if (nameHash == keccak256("coordination")) {
            coordinationContract = addr;
        } else if (nameHash == keccak256("control")) {
            controlContract = addr;
        } else if (nameHash == keccak256("audit")) {
            auditContract = addr;
        } else if (nameHash == keccak256("bridge")) {
            bridgeContract = addr;
        }
        emit SubsystemRegistered(name, addr);
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

    function updatePolicyRoot(bytes32 _root) external onlyOwner {
        policyRoot = _root;
        emit PolicyRootUpdated(_root);
    }

    function updatePolicy(bytes32 scopeId, bytes32 version) external onlyOwner {
        policyVersion[scopeId] = version;
        emit PolicyUpdated(scopeId, version);
    }

    function close(bytes32 id) external onlyOwner {
        require(!closed[id], "Already closed");
        closed[id] = true;
        emit Closed(id);
    }

    function isClosed(bytes32 id) external view returns (bool) {
        return closed[id];
    }

    function getPolicyVersion(bytes32 scopeId) external view returns (bytes32) {
        return policyVersion[scopeId];
    }
}
