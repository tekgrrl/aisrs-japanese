/**
 * Maps SRS stages (0-8) to the AISRS Progression Levels.
 */

export type SrsLevel = 'Sumi-suri' | 'Kaisho' | 'Gyosho' | 'Sosho' | 'Mushin';

export const SRS_LEVELS: Record<number, SrsLevel> = {
    0: 'Sumi-suri',
    1: 'Sumi-suri',
    2: 'Sumi-suri',
    3: 'Sumi-suri',
    4: 'Kaisho',
    5: 'Kaisho',
    6: 'Gyosho',
    7: 'Sosho',
    8: 'Mushin',
};

export function getSrsLevelName(stage: number): SrsLevel {
    return SRS_LEVELS[stage] || 'Sumi-suri';
}

/**
 * Returns a numeric index for the level (0-4) to facilitate comparison.
 * 0: Sumi-suri (Stages 0-3)
 * 1: Kaisho (Stages 4-5)
 * 2: Gyosho (Stage 6)
 * 3: Sosho (Stage 7)
 * 4: Mushin (Stage 8)
 */
export function getSrsLevelIndex(stage: number): number {
    if (stage >= 8) return 4; // Mushin
    if (stage === 7) return 3; // Sosho
    if (stage === 6) return 2; // Gyosho
    if (stage >= 4) return 1; // Kaisho
    return 0; // Sumi-suri
}
