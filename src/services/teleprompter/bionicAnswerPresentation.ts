import { extractGlanceableGazeBullets } from './bionicPrompterService';
import type { BionicGazeBullet } from './bionicPrompterService';

export interface BionicAnswerPresentation {
  bullets: BionicGazeBullet[];
  fallbackText: string | null;
}

export const getBionicAnswerPresentation = (
  prose: string
): BionicAnswerPresentation => {
  const bullets = extractGlanceableGazeBullets(prose);
  return {
    bullets,
    fallbackText: bullets.length === 0 && prose.trim() ? prose : null,
  };
};
