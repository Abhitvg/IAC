import { useAppStore } from '../store/useAppStore';

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
    let audioContext: AudioContext | null = null;

    try {
        const arrayBuffer = await blob.arrayBuffer();
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextCtor();
        let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Normalize to mono 16 kHz PCM WAV for predictable local Whisper input.
        if (audioBuffer.sampleRate !== 16000 || audioBuffer.numberOfChannels !== 1) {
            const OfflineAudioContextCtor =
                window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const offlineCtx = new OfflineAudioContextCtor(
                1,
                Math.ceil(audioBuffer.duration * 16000),
                16000
            );
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start();
            audioBuffer = await offlineCtx.startRendering();
        }

        const channelData = audioBuffer.getChannelData(0);
        const dataLength = channelData.length * 2;
        if (dataLength === 0) throw new Error('Audio decoding returned zero samples.');

        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);
        let offset = 0;

        const writeString = (value: string) => {
            for (let i = 0; i < value.length; i++) {
                view.setUint8(offset++, value.charCodeAt(i));
            }
        };

        writeString('RIFF');
        view.setUint32(offset, 36 + dataLength, true); offset += 4;
        writeString('WAVE');
        writeString('fmt ');
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2; // PCM
        view.setUint16(offset, 1, true); offset += 2; // Mono
        view.setUint32(offset, 16000, true); offset += 4;
        view.setUint32(offset, 32000, true); offset += 4; // byte rate
        view.setUint16(offset, 2, true); offset += 2; // block align
        view.setUint16(offset, 16, true); offset += 2; // bits per sample
        writeString('data');
        view.setUint32(offset, dataLength, true); offset += 4;

        for (let i = 0; i < channelData.length; i++) {
            const clamped = Math.max(-1, Math.min(1, channelData[i]));
            const pcmSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
            view.setInt16(offset, pcmSample, true);
            offset += 2;
        }

        const wavBlob = new Blob([buffer], { type: 'audio/wav' });
        useAppStore.getState().updateDiagnostics({
            whisperStatus: `WAV ready: ${wavBlob.size} bytes, 16 kHz mono PCM`,
        });
        return wavBlob;
    } catch (e: any) {
        useAppStore.getState().updateDiagnostics({
            whisperStatus: 'WAV conversion error: ' + (e?.message || String(e)),
        });
        throw e;
    } finally {
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close().catch(() => undefined);
        }
    }
}
