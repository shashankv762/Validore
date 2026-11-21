export type WorkspaceModelPolicy = 'free_only' | 'operator_funded'

/** Public display policy only. Provider configuration and keys stay on the server. */
export function workspaceModelCopy(policy: WorkspaceModelPolicy | undefined) {
  return policy === 'operator_funded' ? {
    title: 'Workspace models',
    description: 'Use the provider models configured for this workspace. The team chooses models for each research task and tries an available provider within its request budget.',
    availability: 'Configured provider models and quotas vary.',
    fundingNote: 'Provider model usage is funded by the workspace operator. Your Validore credits and plan limits still apply.',
  } : {
    title: 'Automatic free models',
    description: 'Use the available free models selected for each research task. If one provider is unavailable, the team tries another within its request budget.',
    availability: 'Free-model availability and quotas vary.',
    fundingNote: null,
  }
}
