
import { useAppStore } from '../store/useAppStore';

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Force resampling to 16kHz using OfflineAudioContext because whisper.cpp STRICTLY rejects anything else
        if (audioBuffer.sampleRate !== 16000) {
            const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
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
        const length = channelData.length * 2;
        if (length === 0) throw new Error('decodeAudioData returned 0 samples!');
        
        const buffer = new ArrayBuffer(44 + length);
        const view = new DataView(buffer);

        let offset = 0;
        const writeString = (str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
            offset += str.length;
        };

        writeString('RIFF');
        view.setUint32(offset, 36 + length, true); offset += 4;
        writeString('WAVE');
        writeString('fmt ');
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, 1, true); offset += 2; // Mono
        view.setUint32(offset, 16000, true); offset += 4;
        view.setUint32(offset, 16000 * 2, true); offset += 4;
        view.setUint16(offset, 2, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeString('data');
        view.setUint32(offset, length, true); offset += 4;

        for (let j = 0; j < channelData.length; j++) {
            let sample = Math.max(-1, Math.min(1, channelData[j]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += 2;
        }

        // Fix naive multipart parsers in C++ (whisper.cpp) that use std::string::find("\r\n--") on binary data
        const u8 = new Uint8Array(buffer);
        for (let i = 44; i < u8.length - 3; i++) {
            if (u8[i] === 0x0D && u8[i+1] === 0x0A && u8[i+2] === 0x2D && u8[i+3] === 0x2D) {
                u8[i+3] = 0x2E; // change '-' to '.'
            }
        }

        const wavBlob = new Blob([buffer], { type: 'audio/wav' });
        useAppStore.getState().updateDiagnostics({ whisperStatus: 'wav generated: ' + wavBlob.size + ' bytes' });
        return wavBlob;
    } catch (e: any) {
        useAppStore.getState().updateDiagnostics({ whisperStatus: 'wav error: ' + e.message });
        throw e;
    }
}
