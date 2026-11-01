/** Keep abuse controls enabled while allowing a small pilot on a shared network. */
export function signupWeeklyIpLimit(value = process.env.SIGNUP_MAX_PER_IP_WEEK): number {
  if (!value) return 3
  const limit = Number(value)
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 20 ? limit : 3
}
