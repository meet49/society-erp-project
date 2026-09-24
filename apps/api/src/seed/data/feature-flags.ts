export const DEFAULT_FEATURE_FLAGS = [
  { key: 'advanced_accounting', name: 'Advanced accounting', description: 'Budgets, fund transfers and period closing.', enabled: true },
  { key: 'online_payments', name: 'Online payments', description: 'Resident online payments through the configured gateway.', enabled: true },
  { key: 'visitor_qr', name: 'Visitor QR passes', description: 'QR pass generation and scanning at the gate.', enabled: true },
  { key: 'advanced_reports', name: 'Advanced reports', description: 'Cross-module analytics and scheduled exports.', enabled: true },
  { key: 'workflow_engine', name: 'Workflow engine', description: 'Configurable multi-level approvals.', enabled: true },
  { key: 'community_forum', name: 'Community forum', description: 'Resident posts and discussions.', enabled: true },
  { key: 'emergency_module', name: 'Emergency module', description: 'SOS, incidents and emergency broadcasts.', enabled: true },
  { key: 'advanced_parking', name: 'Advanced parking', description: 'ANPR / boom-barrier integrations (future).', enabled: false },
  { key: 'iot_integrations', name: 'IoT integrations', description: 'Smart meters, biometric attendance and gate hardware (future).', enabled: false },
];
