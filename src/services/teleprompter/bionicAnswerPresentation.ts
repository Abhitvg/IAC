import {
  extractGlanceableGazeBullets,
  BionicGazeBullet,
} from './bionicPrompterService';

export interface BionicAnswerPresentation {
  bullets: BionicGazeBullet[];
  fallbackText: string | null;
}

/**
 * Preserve the complete answer whenever the HUD cannot derive glanceable bullets.
 * This is especially important for code-only, heading-only, or otherwise sparse
 * historical answers.
 */
export function getBionicAnswerPresentation(prose: string): BionicAnswerPresentation {
  const bullets = extractGlanceableGazeBullets(prose);
  return {
    bullets,
    fallbackText: bullets.length === 0 && prose.trim() ? prose : null,
  };
}
