import { useAppStore } from "../store/useAppStore";

export function downsampleBuffer(
  buffer: Float32Array,
  inSampleRate: number,
  outSampleRate: number
): Float32Array {
  if (inSampleRate === outSampleRate) return buffer;
  if (inSampleRate < outSampleRate) return buffer;
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

  writeString("RIFF");
  view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, 1, true); offset += 2; // Mono
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * 2, true); offset += 4; // byte rate
  view.setUint16(offset, 2, true); offset += 2; // block align
  view.setUint16(offset, 16, true); offset += 2; // bits per sample
  writeString("data");
  view.setUint32(offset, dataLength, true); offset += 4;

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const pcmSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, pcmSample, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  // If already a valid WAV, return directly without unnecessary re-decoding
  if (blob.type === "audio/wav") {
    return blob;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // Check if starts with RIFF
    if (arrayBuffer.byteLength >= 12) {
      const u8 = new Uint8Array(arrayBuffer.slice(0, 4));
      const magic = String.fromCharCode(...u8);
      if (magic === "RIFF") {
        return new Blob([arrayBuffer], { type: "audio/wav" });
      }
    }

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextCtor();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const resampled = downsampleBuffer(channelData, audioBuffer.sampleRate, 16000);
      const wav = encodeWav(resampled, 16000);
      return wav;
    } finally {
      if (audioContext.state !== "closed") {
        await audioContext.close().catch(() => undefined);
      }
    }
  } catch (e: any) {
    console.error("convertBlobToWav error:", e);
    throw e;
  }
}
