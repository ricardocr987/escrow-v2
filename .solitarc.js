// @ts-check
const path = require('path');
const programDir = path.join(__dirname, 'programs', 'escrow-v2');
const idlDir = path.join(__dirname, 'idl');
const sdkDir = path.join(__dirname, 'src', 'generated');
const binaryInstallDir = path.join(__dirname, '.crates');

module.exports = {
  idlGenerator: 'anchor',
  programName: 'escrow_v2',
  programId: 'fqj2TjuPyPpW8a3biqpgfCJn2bWqmGGrDws4uvv8LFZ',
  idlDir,
  sdkDir,
  binaryInstallDir,
  programDir,
};
