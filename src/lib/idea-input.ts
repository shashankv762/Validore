import { z } from 'zod'
export const IdeaInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name with at least 2 characters.').max(100),
  industry: z.string().trim().min(2, 'Enter your primary industry.').max(200),
  product: z.string().trim().min(10, 'Describe your product in at least 10 characters.').max(4000),
  targetCustomer: z.string().trim().min(5, 'Describe the customer you want to reach.').max(2000),
  location: z.string().trim().min(2, 'Enter your launch market.').max(200),
  businessModel: z.string().trim().min(5, 'Describe how your startup will earn revenue.').max(2000),
  coreProblem: z.string().trim().min(10, 'Describe the problem in at least 10 characters.').max(4000),
  proposedSolution: z.string().trim().min(10, 'Describe the solution in at least 10 characters.').max(4000),
})
export type IdeaDraft = z.infer<typeof IdeaInputSchema>
