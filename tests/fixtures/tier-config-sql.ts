/** Legacy table shape: tests apply the additive owner migration afterward. */
export const legacyTierConfigSql = `CREATE TABLE tier_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tier tier NOT NULL UNIQUE,
  monthly_validation_limit integer NOT NULL, max_active_ideas integer NOT NULL,
  max_concurrent_requests integer NOT NULL, max_tokens_per_call integer NOT NULL,
  can_export_pdf boolean NOT NULL DEFAULT false, can_export_csv boolean NOT NULL DEFAULT false,
  can_export_pptx boolean NOT NULL DEFAULT false, can_whitelabel_pdf boolean NOT NULL DEFAULT false,
  can_portfolio_export boolean NOT NULL DEFAULT false, can_lean_canvas boolean NOT NULL DEFAULT false,
  can_pricing_simulator boolean NOT NULL DEFAULT false, can_crowdfunding boolean NOT NULL DEFAULT false,
  can_pitch_deck boolean NOT NULL DEFAULT false, can_ai_lean_canvas boolean NOT NULL DEFAULT false,
  updated_at timestamp DEFAULT now());`
