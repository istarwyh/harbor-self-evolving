import { readDashboardSnapshot, readJobDetail, readTrialDetail, readTrialsPage } from './dashboard.js'
import {
  compareCandidates,
  initializeProject,
  previewContext,
  readEvaluation,
  runDoctor,
  runEvaluation,
  snapshot,
  validateDataset,
} from './evolution.js'

/** One Host-side boundary shared by Agent tools and the Web dashboard. */
export class EvolutionService {
  constructor(config, metadata = {}) {
    this.config = config
    this.metadata = metadata
  }

  snapshot(args) {
    return snapshot(this.config, args)
  }

  initialize(args) {
    return initializeProject(this.config, args)
  }

  run(args) {
    return runEvaluation(this.config, args)
  }

  result(args) {
    return readEvaluation(this.config, args)
  }

  compare(args) {
    return compareCandidates(this.config, args)
  }

  doctor(args) {
    return runDoctor(this.config, args)
  }

  validateDataset(args) {
    return validateDataset(this.config, args)
  }

  previewContext(args) {
    return previewContext(this.config, args)
  }

  dashboard() {
    return readDashboardSnapshot(this.config, this.metadata)
  }

  job(args) {
    return readJobDetail(this.config, args)
  }

  trials(args) {
    return readTrialsPage(this.config, args)
  }

  trial(args) {
    return readTrialDetail(this.config, args)
  }
}
