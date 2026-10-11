import fs from 'fs';
import path from 'path';

const basePath = 'c:/Users/2025/IIT DELHI/entrepreneur/Validore/src/app/api';

function patchRoute(name, costConst) {
  const file = path.join(basePath, name, 'route.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Replace check logic
  // For crowdfunding:
  // import { checkCredits, deductCredits } from '@/lib/credits'
  // import { CREDIT_COSTS } from '@/lib/credit-costs'
  
  if (!content.includes('checkCredits')) {
    content = content.replace(/import \{ NextRequest, NextResponse \} from 'next\/server'/, 
      `import { NextRequest, NextResponse } from 'next/server'\nimport { checkCredits, deductCredits } from '@/lib/credits'\nimport { CREDIT_COSTS } from '@/lib/credit-costs'`);
  }

  if (name === 'crowdfunding') {
    content = content.replace(/const access = await canUserAccessWithCredits\(user\.id, 'crowdfunding'\)[\s\S]*?if \(!access\.allowed\) \{[\s\S]*?\}[\s\S]*?if \(access\.reason === 'credit'\) \{[\s\S]*?\}/, 
      `const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.${costConst})
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }`);
    content = content.replace(/const \[saved\] = await db\.insert\(crowdfundingAnalyses\)\.values\(\{/, 
      `await deductCredits(dbUser.id, CREDIT_COSTS.${costConst}, '${costConst}', i.ideaId)\n  const [saved] = await db.insert(crowdfundingAnalyses).values({`);
  } else if (name === 'lean-canvas') {
    content = content.replace(/const access = await canUserAccess\(user\.id, 'canAiLeanCanvas'\)[\s\S]*?if \(!access\.allowed\) \{[\s\S]*?\}/, 
      `const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.${costConst})
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }`);
    content = content.replace(/const \[saved\] = await db\.insert\(leanCanvases\)\.values\(\{/, 
      `await deductCredits(dbUser.id, CREDIT_COSTS.${costConst}, '${costConst}', idea.id)\n  const [saved] = await db.insert(leanCanvases).values({`);
  } else if (name === 'pitch-deck') {
    content = content.replace(/const access = await canUserAccessWithCredits\(user\.id, 'pitch_deck'\)[\s\S]*?if \(!access\.allowed\) \{[\s\S]*?\}[\s\S]*?if \(access\.reason === 'credit'\) \{[\s\S]*?\}/, 
      `const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.${costConst})
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }`);
    content = content.replace(/const \[saved\] = await db\.insert\(pitchDecks\)\.values\(\{/, 
      `await deductCredits(dbUser.id, CREDIT_COSTS.${costConst}, '${costConst}', idea.id)\n  const [saved] = await db.insert(pitchDecks).values({`);
  } else if (name === 'pricing') {
    content = content.replace(/const access = await canUserAccess\(user\.id, 'canPricingSimulator'\)[\s\S]*?if \(!access\.allowed\) \{[\s\S]*?\}/, 
      `const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.${costConst})
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }`);
    content = content.replace(/const \[saved\] = await db\.insert\(pricingSimulations\)\.values\(\{/, 
      `await deductCredits(dbUser.id, CREDIT_COSTS.${costConst}, '${costConst}', idea.id)\n  const [saved] = await db.insert(pricingSimulations).values({`);
  }

  // Also remove old tier-gate imports if any
  content = content.replace(/import \{ canUserAccessWithCredits, decrementCredit \} from '@\/lib\/tier-gate'\n/g, '');
  content = content.replace(/import \{ canUserAccess \} from '@\/lib\/tier-gate'\n/g, '');

  fs.writeFileSync(file, content);
}

try {
  patchRoute('crowdfunding', 'CROWDFUNDING');
  patchRoute('lean-canvas', 'LEAN_CANVAS');
  patchRoute('pitch-deck', 'PITCH_DECK');
  patchRoute('pricing', 'PRICING');
  console.log('patched');
} catch (e) {
  console.error(e);
}
