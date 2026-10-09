import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function LiveTranscript() {
  const { transcript } = useAppStore();
  return <div style={{color:'#fff'}}>{transcript.map(t => <div key={t.id}>{t.speaker}: {t.text}</div>)}</div>;
}