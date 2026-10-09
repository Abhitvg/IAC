const fs = require('fs');
let code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

const target = `        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const filename = \`recording_${timestamp}.wav\`;
        
        try {
          const recordingsDir = await window.electronAPI.getRecordingsDir();
          let wavBlob: Blob;
          try {
            wavBlob = await convertToWav(audioBlob);
          } catch {
            wavBlob = audioBlob; // Fallback to original format
          }
          
          const arrayBuffer = await wavBlob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await window.electronAPI.writeFile(\`\${recordingsDir}/\${filename}\`, buffer);
          set({ lastRecordingPath: \`\${recordingsDir}/\${filename}\` });
          get().showToast('Recording saved');
        } catch (e) {
          console.error('Failed to save recording:', e);
        }

        // Auto-transcribe
        set({
          pipeline: { stage: 'transcribing', progress: 30, message: 'Transcribing...' },
        });

        try {
          const apiKey = await window.electronAPI.getApiKey('openai');
          const result = await transcribeAudio(wavBlob, { apiKey: settings?.aiProvider === 'openai' ? apiKey : undefined, endpoint: settings?.aiProvider === 'ollama' ? 'http://127.0.0.1:8080/inference' : undefined, model: settings?.aiProvider === 'openai' ? 'whisper-1' : 'base' });`;

const replacement = `        let wavBlob = audioBlob;
        if (settings?.aiProvider === 'ollama') {
          try {
            wavBlob = await convertToWav(audioBlob);
          } catch (e) {
            console.error('Wav conversion failed', e);
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const filename = \`recording_\${timestamp}.wav\`;
        
        try {
          const recordingsDir = await window.electronAPI.getRecordingsDir();
          const arrayBuffer = await wavBlob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await window.electronAPI.writeFile(\`\${recordingsDir}/\${filename}\`, buffer);
          set({ lastRecordingPath: \`\${recordingsDir}/\${filename}\` });
          get().showToast('Recording saved');
        } catch (e) {
          console.error('Failed to save recording:', e);
        }

        // Auto-transcribe
        set({
          pipeline: { stage: 'transcribing', progress: 30, message: 'Transcribing...' },
        });

        try {
          const apiKey = await window.electronAPI.getApiKey('openai');
          const result = await transcribeAudio(wavBlob, { apiKey: settings?.aiProvider === 'openai' ? apiKey || undefined : undefined, endpoint: settings?.aiProvider === 'ollama' ? 'http://127.0.0.1:8080/inference' : undefined, model: settings?.aiProvider === 'openai' ? 'whisper-1' : 'base' });`;

code = code.replace(target, replacement);
fs.writeFileSync('src/store/useAppStore.ts', code);
