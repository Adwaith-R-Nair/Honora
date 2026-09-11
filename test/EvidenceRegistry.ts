import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";

const { ethers } = await network.connect();

// Role enum mirrors contracts/EvidenceRegistry.sol
const Role = {
  None: 0,
  Police: 1,
  Forensic: 2,
  Lawyer: 3,
  Judge: 4,
} as const;

async function deployRegistry() {
  const [owner, police, forensic, lawyer, judge, stranger, newHolder] =
    await ethers.getSigners();

  const registry = await ethers.deployContract("EvidenceRegistry");

  await registry.connect(owner).assignRole(police.address, Role.Police);
  await registry.connect(owner).assignRole(forensic.address, Role.Forensic);
  await registry.connect(owner).assignRole(lawyer.address, Role.Lawyer);
  await registry.connect(owner).assignRole(judge.address, Role.Judge);

  return { registry, owner, police, forensic, lawyer, judge, stranger, newHolder };
}

describe("EvidenceRegistry", function () {
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const [owner] = await ethers.getSigners();
      const registry = await ethers.deployContract("EvidenceRegistry");
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("starts with zero evidence and supporting docs", async function () {
      const registry = await ethers.deployContract("EvidenceRegistry");
      expect(await registry.evidenceCount()).to.equal(0n);
      expect(await registry.supportingDocCount()).to.equal(0n);
    });
  });

  describe("Role management (owner-only)", function () {
    it("lets the owner assign a role and emits RoleAssigned", async function () {
      const { registry, owner, stranger } = await deployRegistry();

      await expect(registry.connect(owner).assignRole(stranger.address, Role.Police))
        .to.emit(registry, "RoleAssigned")
        .withArgs(stranger.address, Role.Police, anyValue);

      expect(await registry.getRole(stranger.address)).to.equal(Role.Police);
    });

    it("lets the owner revoke a role and emits RoleRevoked", async function () {
      const { registry, owner, police } = await deployRegistry();

      await expect(registry.connect(owner).revokeRole(police.address))
        .to.emit(registry, "RoleRevoked")
        .withArgs(police.address, anyValue);

      expect(await registry.getRole(police.address)).to.equal(Role.None);
    });

    it("reverts assignRole from a non-owner with NotOwner", async function () {
      const { registry, stranger } = await deployRegistry();

      await expect(
        registry.connect(stranger).assignRole(stranger.address, Role.Police)
      ).to.be.revertedWithCustomError(registry, "NotOwner");
    });

    it("reverts revokeRole from a non-owner with NotOwner", async function () {
      const { registry, police, stranger } = await deployRegistry();

      await expect(
        registry.connect(stranger).revokeRole(police.address)
      ).to.be.revertedWithCustomError(registry, "NotOwner");
    });

    it("reverts assignRole to the zero address with InvalidAddress", async function () {
      const { registry, owner } = await deployRegistry();

      await expect(
        registry.connect(owner).assignRole(ethers.ZeroAddress, Role.Police)
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
    });

    it("reverts revokeRole on the zero address with InvalidAddress", async function () {
      const { registry, owner } = await deployRegistry();

      await expect(
        registry.connect(owner).revokeRole(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
    });
  });

  describe("addEvidence (Police only)", function () {
    it("registers evidence, records first custody entry, and emits EvidenceAdded", async function () {
      const { registry, police } = await deployRegistry();

      const tx = registry.connect(police).addEvidence(1, "cid-1", "hash-1");
      await expect(tx)
        .to.emit(registry, "EvidenceAdded")
        .withArgs(1n, 1n, "cid-1", "hash-1", police.address, anyValue);

      const evidence = await registry.getEvidence(1);
      expect(evidence.caseId).to.equal(1n);
      expect(evidence.ipfsCID).to.equal("cid-1");
      expect(evidence.fileHash).to.equal("hash-1");
      expect(evidence.uploadedBy).to.equal(police.address);
      expect(evidence.currentHolder).to.equal(police.address);
      expect(evidence.exists).to.equal(true);

      const history = await registry.getCustodyHistory(1);
      expect(history.length).to.equal(1);
      expect(history[0].from).to.equal(ethers.ZeroAddress);
      expect(history[0].to).to.equal(police.address);
    });

    it("reverts for a non-Police caller with NotAuthorized", async function () {
      const { registry, forensic } = await deployRegistry();

      await expect(
        registry.connect(forensic).addEvidence(1, "cid-1", "hash-1")
      ).to.be.revertedWithCustomError(registry, "NotAuthorized");
    });

    it("reverts on empty ipfsCID with EmptyField", async function () {
      const { registry, police } = await deployRegistry();

      await expect(registry.connect(police).addEvidence(1, "", "hash-1"))
        .to.be.revertedWithCustomError(registry, "EmptyField")
        .withArgs("ipfsCID");
    });

    it("reverts on empty fileHash with EmptyField", async function () {
      const { registry, police } = await deployRegistry();

      await expect(registry.connect(police).addEvidence(1, "cid-1", ""))
        .to.be.revertedWithCustomError(registry, "EmptyField")
        .withArgs("fileHash");
    });

    it("reverts on a duplicate fileHash with DuplicateFileHash", async function () {
      const { registry, police } = await deployRegistry();

      await registry.connect(police).addEvidence(1, "cid-1", "hash-1");

      await expect(registry.connect(police).addEvidence(2, "cid-2", "hash-1"))
        .to.be.revertedWithCustomError(registry, "DuplicateFileHash")
        .withArgs("hash-1");
    });
  });

  describe("addSupportingDoc (Forensic or Lawyer)", function () {
    async function withEvidence() {
      const ctx = await deployRegistry();
      await ctx.registry.connect(ctx.police).addEvidence(1, "cid-1", "hash-1");
      return ctx;
    }

    it("lets Forensic attach a supporting doc and emits SupportingDocAdded", async function () {
      const { registry, forensic } = await withEvidence();

      await expect(
        registry.connect(forensic).addSupportingDoc(1, "doc-cid", "doc-hash", "forensic_report")
      )
        .to.emit(registry, "SupportingDocAdded")
        .withArgs(1n, 1n, "doc-cid", "doc-hash", forensic.address, "forensic_report", anyValue);

      const docs = await registry.getSupportingDocs(1);
      expect(docs.length).to.equal(1);
      expect(docs[0].docType).to.equal("forensic_report");
    });

    it("lets Lawyer attach a supporting doc", async function () {
      const { registry, lawyer } = await withEvidence();

      await expect(
        registry.connect(lawyer).addSupportingDoc(1, "doc-cid", "doc-hash", "court_filing")
      ).to.not.revert(ethers);
    });

    it("reverts for Police (InsufficientRole)", async function () {
      const { registry, police } = await withEvidence();

      await expect(
        registry.connect(police).addSupportingDoc(1, "doc-cid", "doc-hash", "forensic_report")
      ).to.be.revertedWithCustomError(registry, "InsufficientRole");
    });

    it("reverts for a nonexistent evidenceId with EvidenceNotFound", async function () {
      const { registry, forensic } = await deployRegistry();

      await expect(
        registry.connect(forensic).addSupportingDoc(99, "doc-cid", "doc-hash", "forensic_report")
      )
        .to.be.revertedWithCustomError(registry, "EvidenceNotFound")
        .withArgs(99);
    });

    it("reverts on a duplicate fileHash with DuplicateFileHash", async function () {
      const { registry, forensic } = await withEvidence();

      await registry.connect(forensic).addSupportingDoc(1, "doc-cid", "doc-hash", "forensic_report");

      await expect(
        registry.connect(forensic).addSupportingDoc(1, "doc-cid-2", "doc-hash", "forensic_report")
      )
        .to.be.revertedWithCustomError(registry, "DuplicateFileHash")
        .withArgs("doc-hash");
    });
  });

  describe("transferCustody (Police or Forensic, current holder only)", function () {
    async function withEvidence() {
      const ctx = await deployRegistry();
      await ctx.registry.connect(ctx.police).addEvidence(1, "cid-1", "hash-1");
      return ctx;
    }

    it("lets the current holder transfer custody and emits CustodyTransferred", async function () {
      const { registry, police, newHolder } = await withEvidence();

      await expect(registry.connect(police).transferCustody(1, newHolder.address))
        .to.emit(registry, "CustodyTransferred")
        .withArgs(1n, police.address, newHolder.address, anyValue);

      const evidence = await registry.getEvidence(1);
      expect(evidence.currentHolder).to.equal(newHolder.address);

      const history = await registry.getCustodyHistory(1);
      expect(history.length).to.equal(2);
      expect(history[1].from).to.equal(police.address);
      expect(history[1].to).to.equal(newHolder.address);
    });

    it("reverts when the caller is not the current holder (NotCurrentHolder)", async function () {
      const { registry, forensic, newHolder } = await withEvidence();

      // forensic has the right ROLE to call transferCustody, but isn't the current holder
      await expect(registry.connect(forensic).transferCustody(1, newHolder.address))
        .to.be.revertedWithCustomError(registry, "NotCurrentHolder")
        .withArgs(1, forensic.address);
    });

    it("reverts for Lawyer/Judge (InsufficientRole)", async function () {
      const { registry, lawyer, newHolder } = await withEvidence();

      await expect(
        registry.connect(lawyer).transferCustody(1, newHolder.address)
      ).to.be.revertedWithCustomError(registry, "InsufficientRole");
    });

    it("reverts transferring to the zero address with InvalidAddress", async function () {
      const { registry, police } = await withEvidence();

      await expect(
        registry.connect(police).transferCustody(1, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
    });

    it("reverts for a nonexistent evidenceId with EvidenceNotFound", async function () {
      const { registry, police, newHolder } = await deployRegistry();

      await expect(registry.connect(police).transferCustody(99, newHolder.address))
        .to.be.revertedWithCustomError(registry, "EvidenceNotFound")
        .withArgs(99);
    });
  });

  describe("recordIntegrityCheck (Forensic or Judge)", function () {
    async function withEvidence() {
      const ctx = await deployRegistry();
      await ctx.registry.connect(ctx.police).addEvidence(1, "cid-1", "hash-1");
      return ctx;
    }

    it("lets Forensic record a passing check and emits IntegrityVerified", async function () {
      const { registry, forensic } = await withEvidence();

      await expect(registry.connect(forensic).recordIntegrityCheck(1, true))
        .to.emit(registry, "IntegrityVerified")
        .withArgs(1n, forensic.address, true, anyValue);
    });

    it("lets Judge record a failing check", async function () {
      const { registry, judge } = await withEvidence();

      await expect(registry.connect(judge).recordIntegrityCheck(1, false))
        .to.emit(registry, "IntegrityVerified")
        .withArgs(1n, judge.address, false, anyValue);
    });

    it("reverts for Police/Lawyer (InsufficientRole)", async function () {
      const { registry, police, lawyer } = await withEvidence();

      await expect(
        registry.connect(police).recordIntegrityCheck(1, true)
      ).to.be.revertedWithCustomError(registry, "InsufficientRole");

      await expect(
        registry.connect(lawyer).recordIntegrityCheck(1, true)
      ).to.be.revertedWithCustomError(registry, "InsufficientRole");
    });

    it("reverts for a nonexistent evidenceId with EvidenceNotFound", async function () {
      const { registry, forensic } = await deployRegistry();

      await expect(registry.connect(forensic).recordIntegrityCheck(99, true))
        .to.be.revertedWithCustomError(registry, "EvidenceNotFound")
        .withArgs(99);
    });
  });

  describe("View functions", function () {
    it("isFileHashRegistered reflects registered hashes", async function () {
      const { registry, police } = await deployRegistry();

      expect(await registry.isFileHashRegistered("hash-1")).to.equal(false);
      await registry.connect(police).addEvidence(1, "cid-1", "hash-1");
      expect(await registry.isFileHashRegistered("hash-1")).to.equal(true);
    });

    it("getEvidence reverts for a nonexistent evidenceId with EvidenceNotFound", async function () {
      const { registry } = await deployRegistry();

      await expect(registry.getEvidence(99))
        .to.be.revertedWithCustomError(registry, "EvidenceNotFound")
        .withArgs(99);
    });
  });
});
