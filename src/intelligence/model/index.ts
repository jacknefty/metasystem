export * from './classify.js';
export * from './bohmian/index.js';

// Intelligence Future Modeling
export * from './trends.js';
export * from './project.js';
export * from './simulate.js';
export {
  generateOutlook,
  type Recommendation,
  type IntelligenceOutlook,
  // Rename to avoid collision with bohmian types
  type Opportunity as IntelligenceOpportunity,
  type Threat as IntelligenceThreat,
} from './recommend.js';
