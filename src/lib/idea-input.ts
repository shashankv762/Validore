import { z } from 'zod'
import { PUBLIC_RESEARCH_FOCUS_MAX, hasPublicResearchUrl, redactPublicResearchFocus } from './ai/research-brief'
export const PublicResearchFocusSchema = z.string().trim().max(PUBLIC_RESEARCH_FOCUS_MAX, 'Keep the public research focus to 280 characters.')
  .transform(redactPublicResearchFocus)
  .refine(value => value.length <= PUBLIC_RESEARCH_FOCUS_MAX, 'Keep the public research focus to 280 characters.')
  .refine(value => !/[\r\n]/.test(value), 'Use one short topic or customer job on a single line.')
  .refine(value => !hasPublicResearchUrl(value), 'Use a plain topic or customer job without website links.')
export const IdeaInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name with at least 2 characters.').max(100),
  industry: z.string().trim().min(2, 'Enter your primary industry.').max(200),
  product: z.string().trim().min(10, 'Describe your product in at least 10 characters.').max(4000),
  targetCustomer: z.string().trim().min(5, 'Describe the customer you want to reach.').max(2000),
  location: z.string().trim().min(2, 'Enter your launch market.').max(200),
  businessModel: z.string().trim().min(5, 'Describe how your startup will earn revenue.').max(2000),
  coreProblem: z.string().trim().min(10, 'Describe the problem in at least 10 characters.').max(4000),
  proposedSolution: z.string().trim().min(10, 'Describe the solution in at least 10 characters.').max(4000),
  publicResearchFocus: PublicResearchFocusSchema.nullable().transform(value => value ?? '').optional(),
})
// Database briefs represent an omitted public topic as NULL. Form parsing
// normalizes it to an empty string without authorizing a derived topic.
export type IdeaDraft = Omit<z.infer<typeof IdeaInputSchema>, 'publicResearchFocus'> & { publicResearchFocus?: string | null }
