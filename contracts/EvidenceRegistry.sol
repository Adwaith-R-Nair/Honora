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

    address public owner;
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

    modifier evidenceExists(uint256 _evidenceId) {
        if (!evidences[_evidenceId].exists)
            revert EvidenceNotFound(_evidenceId);
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

    function assignRole(address _account, Role _role) external onlyOwner {
        if (_account == address(0)) revert InvalidAddress();
        userRoles[_account] = _role;
        emit RoleAssigned(_account, _role, block.timestamp);
    }

    function revokeRole(address _account) external onlyOwner {
        if (_account == address(0)) revert InvalidAddress();
        userRoles[_account] = Role.None;
        emit RoleRevoked(_account, block.timestamp);
    }

    function getRole(address _account) external view returns (Role) {
        return userRoles[_account];
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    function addEvidence(
        uint256 _caseId,
        string memory _ipfsCID,
        string memory _fileHash
    ) external onlyPolice {
        if (bytes(_ipfsCID).length == 0) revert EmptyField("ipfsCID");
        if (bytes(_fileHash).length == 0) revert EmptyField("fileHash");
        if (fileHashExists[_fileHash]) revert DuplicateFileHash(_fileHash);

        ++evidenceCount;
        uint256 newEvidenceId = evidenceCount;

        evidences[newEvidenceId] = Evidence({
            evidenceId: newEvidenceId,
            caseId: _caseId,
            ipfsCID: _ipfsCID,
            fileHash: _fileHash,
            uploadedBy: msg.sender,
            timestamp: block.timestamp,
            currentHolder: msg.sender,
            exists: true
        });

        fileHashExists[_fileHash] = true;

        custodyHistory[newEvidenceId].push(CustodyRecord({
            from: address(0),
            to: msg.sender,
            timestamp: block.timestamp
        }));

        emit EvidenceAdded(
            newEvidenceId,
            _caseId,
            _ipfsCID,
            _fileHash,
            msg.sender,
            block.timestamp
        );
    }

    function addSupportingDoc(
        uint256 _evidenceId,
        string memory _ipfsCID,
        string memory _fileHash,
        string memory _docType
    ) external onlyForensicOrLawyer evidenceExists(_evidenceId) {
        if (bytes(_ipfsCID).length == 0) revert EmptyField("ipfsCID");
        if (bytes(_fileHash).length == 0) revert EmptyField("fileHash");
        if (bytes(_docType).length == 0) revert EmptyField("docType");
        if (fileHashExists[_fileHash]) revert DuplicateFileHash(_fileHash);

        ++supportingDocCount;
        uint256 newDocId = supportingDocCount;

        supportingDocs[_evidenceId].push(SupportingDoc({
            docId: newDocId,
            evidenceId: _evidenceId,
            ipfsCID: _ipfsCID,
            fileHash: _fileHash,
            uploadedBy: msg.sender,
            timestamp: block.timestamp,
            docType: _docType
        }));

        fileHashExists[_fileHash] = true;

        emit SupportingDocAdded(
            newDocId,
            _evidenceId,
            _ipfsCID,
            _fileHash,
            msg.sender,
            _docType,
            block.timestamp
        );
    }

    function transferCustody(
        uint256 _evidenceId,
        address _newHolder
    ) external evidenceExists(_evidenceId) onlyPoliceOrForensic {
        if (_newHolder == address(0)) revert InvalidAddress();

        Evidence storage evidence = evidences[_evidenceId];

        if (evidence.currentHolder != msg.sender)
            revert NotCurrentHolder(_evidenceId, msg.sender);

        address previousHolder = evidence.currentHolder;
        evidence.currentHolder = _newHolder;

        custodyHistory[_evidenceId].push(CustodyRecord({
            from: previousHolder,
            to: _newHolder,
            timestamp: block.timestamp
        }));

        emit CustodyTransferred(
            _evidenceId,
            previousHolder,
            _newHolder,
            block.timestamp
        );
    }

    function recordIntegrityCheck(
        uint256 _evidenceId,
        bool _passed
    ) external evidenceExists(_evidenceId) onlyForensicOrJudge {
        emit IntegrityVerified(
            _evidenceId,
            msg.sender,
            _passed,
            block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getEvidence(
        uint256 _evidenceId
    ) external view evidenceExists(_evidenceId) returns (Evidence memory) {
        return evidences[_evidenceId];
    }

    function getCustodyHistory(
        uint256 _evidenceId
    ) external view evidenceExists(_evidenceId) returns (CustodyRecord[] memory) {
        return custodyHistory[_evidenceId];
    }

    function getSupportingDocs(
        uint256 _evidenceId
    ) external view evidenceExists(_evidenceId) returns (SupportingDoc[] memory) {
        return supportingDocs[_evidenceId];
    }

    function isFileHashRegistered(
        string calldata _fileHash
    ) external view returns (bool) {
        return fileHashExists[_fileHash];
    }
}
