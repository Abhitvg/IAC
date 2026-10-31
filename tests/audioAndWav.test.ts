import { describe, it, expect } from 'vitest';
import {
  isValidWav,
  encodeWav,
  downsampleBuffer,
  convertBlobToWav,
} from '../src/utils/audioConversion';

describe('Audio & WAV Validation Suite', () => {
  it('validates a correctly structured 16-bit PCM WAV buffer', () => {
    const samples = new Float32Array(16000); // 1 second of audio
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    }
    const wavBlob = encodeWav(samples, 16000);
    expect(wavBlob.type).toBe('audio/wav');
    expect(wavBlob.size).toBe(44 + 16000 * 2);

    const arrayBuffer = new ArrayBuffer(wavBlob.size);
    // Fill buffer using a simulated read
    const view = new DataView(arrayBuffer);
    // Write RIFF
    view.setUint32(0, 0x52494646, false); // 'RIFF'
    view.setUint32(4, 36 + 16000 * 2, true);
    view.setUint32(8, 0x57415645, false); // 'WAVE'
    view.setUint32(12, 0x666d7420, false); // 'fmt '
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 16000, true); // Sample rate
    view.setUint32(28, 32000, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    view.setUint32(36, 0x64617461, false); // 'data'
    view.setUint32(40, 16000 * 2, true);

    expect(isValidWav(arrayBuffer)).toBe(true);
  });

  it('rejects buffers with invalid signatures or headers', () => {
    // Too short
    expect(isValidWav(new ArrayBuffer(20))).toBe(false);

    // Random non-WAV bytes
    const badBuf = new ArrayBuffer(48);
    const view = new DataView(badBuf);
    view.setUint32(0, 0x12345678, false);
    expect(isValidWav(badBuf)).toBe(false);

    // Valid RIFF but invalid WAVE format
    view.setUint32(0, 0x52494646, false);
    view.setUint32(8, 0x41564920, false); // 'AVI '
    expect(isValidWav(badBuf)).toBe(false);

    // Valid RIFF and WAVE, but unsupported sample rate
    view.setUint32(8, 0x57415645, false); // 'WAVE'
    view.setUint32(12, 0x666d7420, false); // 'fmt '
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 4000, true); // Sample rate < 8000
    view.setUint36 = 0;
    expect(isValidWav(badBuf)).toBe(false);
  });

  it('performs accurate downsampling from 48000 Hz to 16000 Hz', () => {
    const inputRate = 48000;
    const targetRate = 16000;
    const inputSamples = new Float32Array(48000); // 1 sec at 48kHz
    for (let i = 0; i < inputSamples.length; i++) {
      inputSamples[i] = 0.75;
    }

    const resampled = downsampleBuffer(inputSamples, inputRate, targetRate);
    expect(resampled.length).toBe(16000);
    expect(resampled[0]).toBeCloseTo(0.75, 4);
    expect(resampled[8000]).toBeCloseTo(0.75, 4);
  });

  it('performs linear interpolation upsampling when input rate is lower than target rate', () => {
    const inputRate = 8000;
    const targetRate = 16000;
    const inputSamples = new Float32Array([0.0, 1.0, 0.0]);

    const resampled = downsampleBuffer(inputSamples, inputRate, targetRate);
    expect(resampled.length).toBe(6);
    expect(resampled[0]).toBe(0.0);
  });

  it('returns original buffer unchanged if input rate matches target rate', () => {
    const inputSamples = new Float32Array([0.1, 0.2, 0.3]);
    const resampled = downsampleBuffer(inputSamples, 16000, 16000);
    expect(resampled).toEqual(inputSamples);
  });

  it('handles empty or near-empty blobs safely in convertBlobToWav', async () => {
    const emptyBlob = new Blob([], { type: 'audio/webm' });
    await expect(convertBlobToWav(emptyBlob)).rejects.toThrow('empty or zero-length');
  });
});
