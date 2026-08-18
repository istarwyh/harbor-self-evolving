import { readDashboardSnapshot } from './dashboard.js'
import { compareCandidates, readEvaluation, runEvaluation, snapshot } from './evolution.js'

/** One Host-side boundary shared by Agent tools and the Web dashboard. */
export class EvolutionService {
  constructor(config, metadata = {}) {
    this.config = config
    this.metadata = metadata
  }

  snapshot(args) {
    return snapshot(this.config, args)
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

  dashboard() {
    return readDashboardSnapshot(this.config, this.metadata)
  }
}
