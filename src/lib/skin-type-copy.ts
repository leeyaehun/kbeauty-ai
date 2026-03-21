export const SKIN_TYPE_EXPLANATION: Record<string, string> = {
  dry: 'Your skin tends to feel tight and needs more moisture.',
  oily: 'Your skin produces extra oil and may look shiny through the day.',
  combination: 'Your skin is oily in some areas and drier in others.',
  sensitive: 'Your skin reacts easily and benefits from gentle, calming care.',
  normal: 'Your skin feels balanced overall without strong dryness or excess oil.',
}

export function getSkinTypeExplanation(skinType: string) {
  return SKIN_TYPE_EXPLANATION[skinType] || 'Your skin profile is balanced based on your latest analysis.'
}
