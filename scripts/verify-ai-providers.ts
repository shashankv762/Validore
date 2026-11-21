import { config } from 'dotenv'
import { acceptanceFingerprint, recordAcceptanceAttempt } from './lib/validation-acceptance'
import { ACCEPTANCE_GATEWAYS, AcceptanceOptionsError, acceptanceArtifacts, acceptanceRuntimeConfiguration, acceptanceRuntimeFingerprint,
  assertSafeModelConfiguration, configureAcceptanceEnvironment, configuredAcceptanceModels, parseAcceptanceOptions } from './lib/acceptance-cli'
import { probeConfiguredModel, type ProviderAcceptanceResult } from './lib/provider-acceptance'
import { workspaceModelPolicy } from '../src/lib/ai/model-policy'

async function main() {
  const args = process.argv.slice(2)
  if (!args.includes('--live') || args.includes('--help')) {
    console.log('Usage: npm run verify:ai -- --live [--provider=ID] [--models=ID,...] [--free-only] [--max-models=1..12] [--timeout-ms=10000..240000]\nProviders: ' + Object.keys(ACCEPTANCE_GATEWAYS).join(', ') + '\nUses configured workspace policy; no live requests occur without --live.')
    return
  }
  const options = parseAcceptanceOptions(args, 'providers')
  config({ path: '.env.local', quiet: true })
  assertSafeModelConfiguration(process.env, options)
  configureAcceptanceEnvironment(process.env, options, 'providers')
  const providerSelection = options.provider ?? 'configured'
  const artifacts = acceptanceArtifacts('providers', providerSelection)
  const configuration = acceptanceRuntimeConfiguration(process.env)
  const configurationFingerprint = acceptanceRuntimeFingerprint(process.env)
  const codeFingerprint = await acceptanceFingerprint(process.cwd())
  const metadata = { providerSelection, requestedModels: options.models ?? null, configuration, configurationFingerprint, codeFingerprint,
    maxModelCallsPerProbe: 2, maxResearchRoundsPerProbe: 1, timeoutMsPerProbe: options.timeoutMs,
    verification: 'Actual production SDK/tool/JSON path with synthetic arithmetic. No customer database or workspace credits. Provider aliases do not prove public model identity, pricing or full-report quality.' }
  const summary = await recordAcceptanceAttempt({ path: artifacts.path, mirrorPaths: [artifacts.legacyPath, artifacts.archivePath], metadata,
    run: async () => {
      const planned = configuredAcceptanceModels(process.env, options)
      if (planned.length > options.maxModels || (options.models?.length ?? 0) > options.maxModels) throw new AcceptanceOptionsError('The configured selection exceeds the probe limit. Select a provider or a smaller --models list.')
      const missing = options.models?.filter(model => !planned.some(item => item.model === model)) ?? []
      const results: ProviderAcceptanceResult[] = missing.map(model => ({ provider: providerSelection, model, protocol: null,
        toolCall: false, structuredOutput: false, passed: false, durationMs: 0, tokens: null,
        error: 'The requested model is not configured or allowed by the current workspace model policy.' }))
      const { gatewayRouter } = await import('../src/lib/ai/gateways')
      const diagnostics = new Map<string, import('../src/lib/ai/gateways').GatewayDiagnostic>()
      const available = planned.length ? await gatewayRouter.candidates({ freeOnly: workspaceModelPolicy() === 'free_only',
        onDiagnostic: diagnostic => diagnostics.set(diagnostic.provider + '/' + diagnostic.model, diagnostic) }) : []
      const providers = [...new Set(planned.map(item => item.provider))]
      for (const provider of providers) {
        const providerPlans = planned.filter(item => item.provider === provider)
        const runProvider = async () => {
          const providerResults: ProviderAcceptanceResult[] = []
          for (const plan of providerPlans) {
            const candidate = available.find(item => item.id === provider && item.modelId === plan.model)
            const diagnostic = diagnostics.get(provider + '/' + plan.model)
            const result: ProviderAcceptanceResult = candidate ? { ...await probeConfiguredModel(candidate, process.env, options.timeoutMs),
              ...(diagnostic ? { catalogCheck: { state: diagnostic.state,
                ...(diagnostic.httpStatus ? { httpStatus: diagnostic.httpStatus } : {}),
                ...(diagnostic.retryAt ? { retryAt: diagnostic.retryAt } : {}) } } : {}) }
              : { provider, model: plan.model, protocol: null, toolCall: false, structuredOutput: false, passed: false, durationMs: 0, tokens: null,
                availability: diagnostic?.state ?? 'gateway_configuration_ineligible',
                ...(diagnostic?.httpStatus ? { httpStatus: diagnostic.httpStatus } : {}),
                ...(diagnostic?.retryAt ? { retryAt: diagnostic.retryAt } : {}),
                error: diagnostic?.state === 'authentication_rejected' ? 'The provider rejected catalog authentication or billing access.'
                  : diagnostic?.state === 'rate_limited' ? 'The provider rate-limited its model catalog.'
                    : diagnostic?.state === 'upstream_unavailable' ? 'The provider model catalog is temporarily unavailable.'
                    : diagnostic?.state === 'network_unavailable' ? 'The provider model catalog could not be reached.'
                      : diagnostic?.state === 'request_timeout' ? 'The provider model catalog request timed out.'
                        : diagnostic?.state === 'request_budget_exhausted' ? 'The application request budget prevented checking the provider catalog.'
                          : diagnostic?.state === 'model_not_listed' ? 'The configured model was not present in the provider catalog.'
                            : diagnostic?.state === 'provider_cooldown' ? 'The provider is in a temporary cooldown.'
                              : diagnostic?.state === 'catalog_unverified' ? 'The provider returned an unrecognized catalog response.'
                                : 'The configured provider or model is not eligible under the current workspace settings.' }
            providerResults.push(result)
            console.log(JSON.stringify(result))
          }
          results.push(...providerResults)
          return { result: { results: providerResults }, summary: { passed: providerResults.every(item => item.passed), modelsChecked: providerResults.length } }
        }
        if (options.provider) await runProvider()
        else {
          const perProvider = acceptanceArtifacts('providers', provider)
          await recordAcceptanceAttempt({ path: perProvider.path, mirrorPaths: [perProvider.archivePath],
            metadata: { ...metadata, providerSelection: provider }, run: runProvider })
        }
      }
      const changed = await acceptanceFingerprint(process.cwd()) !== codeFingerprint || acceptanceRuntimeFingerprint(process.env) !== configurationFingerprint
      return { result: { results }, summary: { passed: results.length > 0 && results.every(item => item.passed) && !changed,
        modelsChecked: results.length, ...(changed ? { failure: 'Source or runtime configuration changed during this run; repeat on a stable revision.' }
          : !results.length ? { failure: 'No configured models are eligible under the current workspace policy. Configure an approved provider/model selection before retrying.' } : {}) } }
    } })
  console.log(JSON.stringify(summary))
  if (!summary.passed) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof AcceptanceOptionsError ? error.message : 'Provider acceptance failed. Inspect the provider-specific artifact and safe diagnostics in reports.')
  process.exitCode = 1
})
