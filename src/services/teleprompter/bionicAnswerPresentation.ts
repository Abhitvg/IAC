import { extractGlanceableGazeBullets } from './bionicPrompterService';
import type { BionicGazeBullet } from './bionicPrompterService';

export interface BionicAnswerPresentation {
  bullets: BionicGazeBullet[];
  fallbackText: string | null;
}

const hasSubstantiveAnswerContent = (prose: string): boolean => {
  const textWithoutCode = prose.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, '');

  return textWithoutCode.split(/\\r?\\n/).some((line) => {
    const normalized = line.trim();
    if (!normalized || /^#{1,6}\\s+/.test(normalized)) return false;
    if (/^(?:-{3,}|\\*{3,}|_{3,})$/.test(normalized)) return false;
    return true;
  });
};

export const getBionicAnswerPresentation = (prose: string): BionicAnswerPresentation => {
  const hasSubstantiveContent = hasSubstantiveAnswerContent(prose);
  const bullets = hasSubstantiveContent ? extractGlanceableGazeBullets(prose) : [];

  return {
    bullets,
    fallbackText: bullets.length === 0 && prose.trim() ? prose : null,
  };
};
