// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EvidenceRegistry
 * @notice Secure blockchain-based evidence management system with RBAC.
 *         Stores evidence metadata and full chain-of-custody history on-chain.
 *         Actual files are stored off-chain on IPFS (via Pinata).
 * @dev Phase 1 + RBAC — Local Hardhat deployment
 */
contract EvidenceRegistry {

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum Role { None, Police, Forensic, Lawyer, Judge }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    address public immutable owner;
    uint256 public evidenceCount;
    uint256 public supportingDocCount;

    mapping(address => Role) public userRoles;
    mapping(uint256 => Evidence) private evidences;
    mapping(uint256 => CustodyRecord[]) private custodyHistory;
    mapping(uint256 => SupportingDoc[]) private supportingDocs;
    mapping(string => bool) private fileHashExists;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Evidence {
        uint256 evidenceId;
        uint256 caseId;
        string ipfsCID;
        string fileHash;
        address uploadedBy;
        uint256 timestamp;
        address currentHolder;
        bool exists;
    }

    struct CustodyRecord {
        address from;
        address to;
        uint256 timestamp;
    }

    struct SupportingDoc {
        uint256 docId;
        uint256 evidenceId;
        string ipfsCID;
        string fileHash;
        address uploadedBy;
        uint256 timestamp;
        string docType;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EvidenceAdded(
        uint256 indexed evidenceId,
        uint256 indexed caseId,
        string ipfsCID,
        string fileHash,
        address indexed uploadedBy,
        uint256 timestamp
    );

    event CustodyTransferred(
        uint256 indexed evidenceId,
        address indexed previousHolder,
        address indexed newHolder,
        uint256 timestamp
    );

    event SupportingDocAdded(
        uint256 indexed docId,
        uint256 indexed evidenceId,
        string ipfsCID,
        string fileHash,
        address indexed uploadedBy,
        string docType,
        uint256 timestamp
    );

    event RoleAssigned(
        address indexed account,
        Role role,
        uint256 timestamp
    );

    event RoleRevoked(
        address indexed account,
        uint256 indexed timestamp
    );

    event IntegrityVerified(
        uint256 indexed evidenceId,
        address indexed verifiedBy,
        bool indexed passed,
        uint256 timestamp
    );

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error NotOwner();
    error NotAuthorized(address caller, Role required);
    error InsufficientRole(address caller);
    error EvidenceNotFound(uint256 evidenceId);
    error NotCurrentHolder(uint256 evidenceId, address caller);
    error InvalidAddress();
    error EmptyField(string fieldName);
    error DuplicateFileHash(string fileHash);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPolice() {
        if (userRoles[msg.sender] != Role.Police)
            revert NotAuthorized(msg.sender, Role.Police);
        _;
    }

    modifier onlyForensicOrLawyer() {
        Role role = userRoles[msg.sender];
        if (role != Role.Forensic && role != Role.Lawyer)
            revert InsufficientRole(msg.sender);
        _;
    }

    modifier onlyForensicOrJudge() {
        Role role = userRoles[msg.sender];
        if (role != Role.Forensic && role != Role.Judge)
            revert InsufficientRole(msg.sender);
        _;
    }

    modifier onlyPoliceOrForensic() {
        Role role = userRoles[msg.sender];
        if (role != Role.Police && role != Role.Forensic)
            revert InsufficientRole(msg.sender);
        _;
    }

    modifier evidenceExists(uint256 evidenceId) {
        if (!evidences[evidenceId].exists)
            revert EvidenceNotFound(evidenceId);
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Admin Functions — Role Management
    // -------------------------------------------------------------------------

    function assignRole(address account, Role role) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        userRoles[account] = role;
        emit RoleAssigned(account, role, block.timestamp);
    }

    function revokeRole(address account) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        userRoles[account] = Role.None;
        emit RoleRevoked(account, block.timestamp);
    }

    function getRole(address account) external view returns (Role) {
        return userRoles[account];
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    function addEvidence(
        uint256 caseId,
        string memory ipfsCID,
        string memory fileHash
    ) external onlyPolice {
        if (bytes(ipfsCID).length == 0) revert EmptyField("ipfsCID");
        if (bytes(fileHash).length == 0) revert EmptyField("fileHash");
        if (fileHashExists[fileHash]) revert DuplicateFileHash(fileHash);

        ++evidenceCount;
        uint256 newEvidenceId = evidenceCount;

        evidences[newEvidenceId] = Evidence({
            evidenceId: newEvidenceId,
            caseId: caseId,
            ipfsCID: ipfsCID,
            fileHash: fileHash,
            uploadedBy: msg.sender,
            timestamp: block.timestamp,
            currentHolder: msg.sender,
            exists: true
        });

        fileHashExists[fileHash] = true;

        custodyHistory[newEvidenceId].push(CustodyRecord({
            from: address(0),
            to: msg.sender,
            timestamp: block.timestamp
        }));

        emit EvidenceAdded(
            newEvidenceId,
            caseId,
            ipfsCID,
            fileHash,
            msg.sender,
            block.timestamp
        );
    }

    function addSupportingDoc(
        uint256 evidenceId,
        string memory ipfsCID,
        string memory fileHash,
        string memory docType
    ) external onlyForensicOrLawyer evidenceExists(evidenceId) {
        if (bytes(ipfsCID).length == 0) revert EmptyField("ipfsCID");
        if (bytes(fileHash).length == 0) revert EmptyField("fileHash");
        if (bytes(docType).length == 0) revert EmptyField("docType");
        if (fileHashExists[fileHash]) revert DuplicateFileHash(fileHash);

        ++supportingDocCount;
        uint256 newDocId = supportingDocCount;

        supportingDocs[evidenceId].push(SupportingDoc({
            docId: newDocId,
            evidenceId: evidenceId,
            ipfsCID: ipfsCID,
            fileHash: fileHash,
            uploadedBy: msg.sender,
            timestamp: block.timestamp,
            docType: docType
        }));

        fileHashExists[fileHash] = true;

        emit SupportingDocAdded(
            newDocId,
            evidenceId,
            ipfsCID,
            fileHash,
            msg.sender,
            docType,
            block.timestamp
        );
    }

    function transferCustody(
        uint256 evidenceId,
        address newHolder
    ) external evidenceExists(evidenceId) onlyPoliceOrForensic {
        if (newHolder == address(0)) revert InvalidAddress();

        Evidence storage evidence = evidences[evidenceId];

        if (evidence.currentHolder != msg.sender)
            revert NotCurrentHolder(evidenceId, msg.sender);

        address previousHolder = evidence.currentHolder;
        evidence.currentHolder = newHolder;

        custodyHistory[evidenceId].push(CustodyRecord({
            from: previousHolder,
            to: newHolder,
            timestamp: block.timestamp
        }));

        emit CustodyTransferred(
            evidenceId,
            previousHolder,
            newHolder,
            block.timestamp
        );
    }

    function recordIntegrityCheck(
        uint256 evidenceId,
        bool passed
    ) external evidenceExists(evidenceId) onlyForensicOrJudge {
        emit IntegrityVerified(
            evidenceId,
            msg.sender,
            passed,
            block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getEvidence(
        uint256 evidenceId
    ) external view evidenceExists(evidenceId) returns (Evidence memory) {
        return evidences[evidenceId];
    }

    function getCustodyHistory(
        uint256 evidenceId
    ) external view evidenceExists(evidenceId) returns (CustodyRecord[] memory) {
        return custodyHistory[evidenceId];
    }

    function getSupportingDocs(
        uint256 evidenceId
    ) external view evidenceExists(evidenceId) returns (SupportingDoc[] memory) {
        return supportingDocs[evidenceId];
    }

    function isFileHashRegistered(
        string calldata fileHash
    ) external view returns (bool) {
        return fileHashExists[fileHash];
    }
}
