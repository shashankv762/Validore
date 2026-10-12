export interface RenderDeploymentOptions { apiKey: string; serviceId: string; commit: string; publicUrl: string; rollbackOnFailure?: boolean }
export interface RenderDeploymentResult { serviceId: string; commit: string; status: string; deployId?: string; rollbackDeployId?: string; rollbackStatus?: string }
export function deployRender(options: RenderDeploymentOptions, dependencies?: { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }): Promise<RenderDeploymentResult>;
