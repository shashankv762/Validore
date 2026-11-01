export const FULL_AGENT_ROLES = ['market', 'customer', 'competitor', 'finance', 'risk', 'evidence', 'product', 'growth', 'synthesis'] as const
export const LITE_AGENT_ROLES = ['market', 'customer', 'synthesis'] as const
export type AgentRole = typeof FULL_AGENT_ROLES[number]
export const FULL_AGENT_COUNT = FULL_AGENT_ROLES.length
export const LITE_AGENT_COUNT = LITE_AGENT_ROLES.length
