/**
 * Audio Conversion and WAV Validation Utility
 * Supports accurate sample-rate conversion (downsampling & upsampling),
 * rigorous WAV header validation, and safe browser audio decoding.
 */

export function downsampleBuffer(
  buffer: Float32Array,
  inSampleRate: number,
  outSampleRate: number
): Float32Array {
  if (inSampleRate === outSampleRate || buffer.length === 0) {
    return new Float32Array(buffer);
  }

  // Linear interpolation for upsampling if inSampleRate < outSampleRate
  if (inSampleRate < outSampleRate) {
    const ratio = inSampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const s0 = buffer[index] ?? 0;
      const s1 = buffer[index + 1] ?? s0;
      result[i] = s0 + frac * (s1 - s0);
    }
    return result;
  }

  // Box-car averaging for downsampling
  const ratio = inSampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function encodeWav(samples: Float32Array, sampleRate = 16000): Blob {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset++, value.charCodeAt(i));
    }
  };

  writeString('RIFF');
  view.setUint32(offset, 36 + dataLength, true);
  offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true); // PCM
  offset += 2;
  view.setUint16(offset, 1, true); // Mono
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * 2, true); // byte rate (sampleRate * numChannels * bitsPerSample/8)
  offset += 4;
  view.setUint16(offset, 2, true); // block align
  offset += 2;
  view.setUint16(offset, 16, true); // bits per sample
  offset += 2;
  writeString('data');
  view.setUint32(offset, dataLength, true);
  offset += 4;

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const pcmSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, pcmSample, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Validates whether an ArrayBuffer is a well-formed WAV file.
 * Checks beyond minimal RIFF: verifies WAVE identifier, fmt subchunk, PCM format, and data subchunk.
 */
export function isValidWav(arrayBuffer: ArrayBuffer): boolean {
  if (!arrayBuffer || arrayBuffer.byteLength < 44) {
    return false;
  }

  const view = new DataView(arrayBuffer);
  const readString = (offset: number, length: number) => {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
  };

  if (readString(0, 4) !== 'RIFF') return false;
  if (readString(8, 4) !== 'WAVE') return false;

  // Search for 'fmt ' chunk
  let offset = 12;
  let hasFmt = false;
  let hasData = false;

  while (offset + 8 <= arrayBuffer.byteLength) {
    const chunkId = readString(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      hasFmt = true;
      if (chunkSize < 16) return false;
      const audioFormat = view.getUint16(offset + 8, true);
      const numChannels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);

      // Must be PCM (1) or IEEE Float (3) and sensible channels/sampleRate
      if ((audioFormat !== 1 && audioFormat !== 3) || numChannels < 1 || sampleRate < 4000) {
        return false;
      }
    } else if (chunkId === 'data') {
      hasData = true;
      break;
    }

    offset += 8 + chunkSize;
  }

  return hasFmt && hasData;
}

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  if (!blob || blob.size === 0) {
    throw new Error('Invalid audio payload: empty or zero-length audio blob');
  }

  const arrayBuffer = await blob.arrayBuffer();

  // If already a valid, structurally verified WAV, return as-is
  if (isValidWav(arrayBuffer)) {
    return blob.type === 'audio/wav' ? blob : new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // Attempt Web Audio decoding for WebM, OGG, MP4, etc.
  if (typeof window === 'undefined' || (!window.AudioContext && !(window as any).webkitAudioContext)) {
    throw new Error('AudioContext unavailable to decode non-WAV audio payload');
  }

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Decoded audio buffer is empty');
    }
    const channelData = audioBuffer.getChannelData(0);
    const resampled = downsampleBuffer(channelData, audioBuffer.sampleRate, 16000);
    return encodeWav(resampled, 16000);
  } catch (e: any) {
    console.error('[audioConversion] Failed to decode and convert audio blob:', e);
    throw new Error(`Audio conversion failed: ${e?.message || String(e)}`, { cause: e });
  } finally {
    if (audioContext.state !== 'closed') {
      await audioContext.close().catch(() => undefined);
    }
  }
}
