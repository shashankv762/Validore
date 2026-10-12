import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function deployRender(options, dependencies = {}) {
  const { apiKey, serviceId, commit, publicUrl, rollbackOnFailure = true } = options
  if (!apiKey || !/^srv-[A-Za-z0-9_-]{5,80}$/.test(serviceId || '') || !/^[a-f0-9]{40,64}$/i.test(commit || '')) throw new Error('Set the Render credential, service ID, and full tested commit SHA')
  const origin = new URL(publicUrl)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Render deployment requires an HTTPS public origin')
  const fetcher = dependencies.fetcher ?? fetch
  const sleep = dependencies.sleep ?? (ms => new Promise(done => setTimeout(done, ms)))
  const now = dependencies.now ?? Date.now
  const apiRoot = 'https://api.render.com/v1/services/' + serviceId
  const record = { serviceId, commit, status: 'starting' }
  const api = async (path, method = 'GET', body) => {
    const response = await fetcher(apiRoot + path, { method, redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw new Error('Render API request failed with HTTP ' + response.status)
    // Queued deploy responses do not guarantee a body or deployment ID.
    if (response.status === 202) return null
    return response.json()
  }
  const listLive = async () => {
    const rows = await api('/deploys?status=live&limit=20')
    if (!Array.isArray(rows)) throw new Error('Unexpected Render deployment list')
    return rows.map(row => row.deploy).find(deploy => deploy?.status === 'live')
  }
  const waitLive = async (id, expectedCommit, deadline) => {
    let previousStatus
    while (now() < deadline) {
      const deploy = await api('/deploys/' + id)
      if (deploy.status !== previousStatus) { console.log('Render ' + id + ': ' + deploy.status); previousStatus = deploy.status }
      if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(deploy.status)) throw new Error('Render deployment ended with status ' + deploy.status)
      if (deploy.status === 'live') {
        if (deploy.commit?.id !== expectedCommit) throw new Error('Live Render revision does not match the tested commit')
        return
      }
      await sleep(5000)
    }
    throw new Error('Render deployment timed out; inspect the deployment before retrying')
  }
  const verifySite = async expectedCommit => {
    const deadline = now() + 60_000
    while (now() < deadline) {
      try {
        const health = await fetcher(origin.origin + '/api/health', { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'Cache-Control': 'no-cache' } })
        const data = health.ok ? await health.json() : null
        if (data?.status === 'ok' && data.commit === expectedCommit) {
          const page = await fetcher(origin.origin + '/', { redirect: 'error', signal: AbortSignal.timeout(10_000) })
          if (page.ok && (await page.text()).toLowerCase().includes('validore')) return
        }
      } catch {}
      await sleep(3000)
    }
    throw new Error('Public health/revision or landing check failed')
  }
  const previous = await listLive()
  const started = now()
  let deploymentId
  let becameLive = false
  try {
    // Mutations are made once. Ambiguous network responses never trigger a second deploy.
    const created = await api('/deploys', 'POST', { commitId: commit, clearCache: 'do_not_clear' })
    deploymentId = created?.id
    if (!deploymentId) {
      const deadline = started + 60_000
      while (!deploymentId && now() < deadline) {
        const rows = await api('/deploys?limit=20&createdAfter=' + encodeURIComponent(new Date(started).toISOString()))
        if (!Array.isArray(rows)) throw new Error('Unexpected Render deployment list')
        const matches = rows.map(row => row.deploy).filter(deploy => deploy?.commit?.id === commit)
        if (matches.length > 1) throw new Error('Multiple queued deployments match this commit; inspect Render before retrying')
        deploymentId = matches[0]?.id
        if (!deploymentId) await sleep(5000)
      }
    }
    if (!deploymentId || !/^dep-[A-Za-z0-9_-]+$/.test(deploymentId)) throw new Error('Render queued the release without an identifiable deploy; inspect Render before retrying')
    record.deployId = deploymentId
    await waitLive(deploymentId, commit, started + 20 * 60_000)
    becameLive = true
    await verifySite(commit)
    record.status = 'live'
    return record
  } catch (error) {
    record.status = 'failed'
    if (becameLive && rollbackOnFailure && previous?.id && previous.commit?.id) {
      try {
        const current = await listLive()
        if (current?.id !== deploymentId) throw new Error('Another deployment is live; automatic rollback is unsafe')
        const reverted = await api('/rollback', 'POST', { deployId: previous.id })
        if (!reverted?.id || !/^dep-[A-Za-z0-9_-]+$/.test(reverted.id)) throw new Error('Rollback did not return a deployment ID; inspect Render')
        await waitLive(reverted.id, previous.commit.id, now() + 8 * 60_000)
        await verifySite(previous.commit.id)
        record.rollbackDeployId = reverted.id
        record.status = 'rolled_back'
      } catch { record.rollbackStatus = 'unverified'; console.error('Rollback could not be verified; inspect the Render service immediately') }
    }
    error.deployment = record
    throw error
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let result
  try {
    result = await deployRender({ apiKey: process.env.RENDER_API_KEY, serviceId: process.env.RENDER_SERVICE_ID,
      commit: process.env.GIT_SHA_FULL, publicUrl: process.env.NEXT_PUBLIC_APP_URL,
      rollbackOnFailure: process.env.RENDER_ROLLBACK_ON_FAILURE !== 'false' })
    console.log('Verified Render release: ' + result.commit)
  } catch (error) {
    result = error.deployment ?? { status: 'failed' }
    console.error(error.message)
    process.exitCode = 1
  }
  // Jenkins prepares this fixed generated directory before deployment.
  try { await writeFile(resolve('reports/render-deploy.json'), JSON.stringify(result, null, 2) + '\n') }
  catch { console.error('Unable to write Render deployment report'); process.exitCode = 1 }
}
