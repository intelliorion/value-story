export const DRIVER_GROUPS = Object.freeze({
  effectiveness: Object.freeze([
    'productivity',
    'operational-adaptability',
    'governance-oversight',
    'standardization-knowledge',
    'high-value-skills-ip',
    'differentiation',
  ]),
  efficiency: Object.freeze([
    'labor-cost-efficiency',
    'process-cost-efficiency',
    'overhead-cost-efficiency',
    'capex-reduction',
  ]),
});

export const ALL_DRIVERS = Object.freeze([
  ...DRIVER_GROUPS.effectiveness,
  ...DRIVER_GROUPS.efficiency,
]);

export const DRIVER_LABELS = Object.freeze({
  'productivity': 'Productivity',
  'operational-adaptability': 'Operational Adaptability',
  'governance-oversight': 'Governance & Oversight',
  'standardization-knowledge': 'Standardization & Knowledge',
  'high-value-skills-ip': 'High-Value Skills & IP',
  'differentiation': 'Differentiation',
  'labor-cost-efficiency': 'Labor Cost Efficiency',
  'process-cost-efficiency': 'Process Cost Efficiency',
  'overhead-cost-efficiency': 'Overhead Cost Efficiency',
  'capex-reduction': 'CapEx Reduction',
});

export function isDriver(id) {
  return typeof id === 'string' && ALL_DRIVERS.includes(id);
}

export function driverGroup(id) {
  if (DRIVER_GROUPS.effectiveness.includes(id)) return 'effectiveness';
  if (DRIVER_GROUPS.efficiency.includes(id)) return 'efficiency';
  return null;
}
