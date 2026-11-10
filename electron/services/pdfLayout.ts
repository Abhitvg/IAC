/* eslint-disable no-control-regex */
export interface ExtractedPdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Geometric Layout & Multi-Column Sorting
 * Clusters raw PDF text items into lines and columns to prevent interleaving of multi-column resumes.
 */
export function sortAndFormatTextItems(rawItems: any[]): string {
  const items: ExtractedPdfItem[] = [];

  for (const item of rawItems) {
    if ('str' in item && typeof item.str === 'string') {
      const normalized = item.str
        .replace(/\uFB00/g, 'ff')
        .replace(/\uFB01/g, 'fi')
        .replace(/\uFB02/g, 'fl')
        .replace(/\uFB03/g, 'ffi')
        .replace(/\uFB04/g, 'ffl')
        .replace(/\uFB05/g, 'ft')
        .replace(/\uFB06/g, 'st')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      if (normalized.trim()) {
        const x = Array.isArray(item.transform) ? item.transform[4] : 0;
        const y = Array.isArray(item.transform) ? item.transform[5] : 0;
        const width = item.width || 0;
        const height = item.height || 10;
        items.push({ str: normalized, x, y, width, height });
      }
    }
  }

  if (items.length === 0) return '';

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.x + it.width > maxX) maxX = it.x + it.width;
    if (it.y < minY) minY = it.y;
    if (it.y + it.height > maxY) maxY = it.y + it.height;
  }

  const pageWidth = maxX - minX;

  // Helper to format a cluster of items into lines
  const formatLineCluster = (clusterItems: ExtractedPdfItem[]): string => {
    const lines: Array<{ y: number; items: ExtractedPdfItem[] }> = [];
    const sorted = [...clusterItems].sort((a, b) => b.y - a.y);

    for (const item of sorted) {
      let foundLine = false;
      for (const line of lines) {
        if (Math.abs(line.y - item.y) <= Math.max(3.5, item.height * 0.6)) {
          line.items.push(item);
          foundLine = true;
          break;
        }
      }
      if (!foundLine) {
        lines.push({ y: item.y, items: [item] });
      }
    }

    lines.sort((a, b) => b.y - a.y);

    return lines
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter((l) => l.length > 0)
      .join('\n');
  };

  // Detect 2-column layout if page width is sufficient and enough text items exist
  let bestSplitX: number | null = null;
  let maxColumnScore = 0;

  if (pageWidth > 150 && items.length > 15) {
    const step = pageWidth / 40;
    for (
      let candidateX = minX + 0.25 * pageWidth;
      candidateX <= minX + 0.7 * pageWidth;
      candidateX += step
    ) {
      const gutterLeft = candidateX - 8;
      const gutterRight = candidateX + 8;

      let leftCount = 0;
      let rightCount = 0;
      let crossingCount = 0;

      for (const it of items) {
        const itRight = it.x + it.width;
        if (itRight <= gutterLeft) {
          leftCount++;
        } else if (it.x >= gutterRight) {
          rightCount++;
        } else {
          crossingCount++;
        }
      }

      if (leftCount >= items.length * 0.15 && rightCount >= items.length * 0.15) {
        const score = leftCount + rightCount - crossingCount * 2.5;
        if (score > maxColumnScore) {
          maxColumnScore = score;
          bestSplitX = candidateX;
        }
      }
    }
  }

  // If a distinct 2-column split was discovered
  if (bestSplitX !== null && maxColumnScore > items.length * 0.35) {
    const splitX = bestSplitX;

    // Detect if top header spans wide across the columns
    let headerY = maxY + 1;
    for (const it of items) {
      const itRight = it.x + it.width;
      const isCrossing = it.x < splitX - 10 && itRight > splitX + 10;
      if (isCrossing && it.y > minY + (maxY - minY) * 0.65) {
        if (it.y < headerY) {
          headerY = it.y;
        }
      }
    }

    const headerItems: ExtractedPdfItem[] = [];
    const col1Items: ExtractedPdfItem[] = [];
    const col2Items: ExtractedPdfItem[] = [];

    for (const it of items) {
      if (it.y >= headerY - 5) {
        headerItems.push(it);
      } else if (it.x + it.width / 2 < splitX) {
        col1Items.push(it);
      } else {
        col2Items.push(it);
      }
    }

    const sections: string[] = [];
    if (headerItems.length > 0) {
      sections.push(formatLineCluster(headerItems));
    }
    if (col1Items.length > 0) {
      sections.push(formatLineCluster(col1Items));
    }
    if (col2Items.length > 0) {
      sections.push(formatLineCluster(col2Items));
    }

    return sections.filter(Boolean).join('\n\n');
  }

  // Single-column fallback
  return formatLineCluster(items);
}
