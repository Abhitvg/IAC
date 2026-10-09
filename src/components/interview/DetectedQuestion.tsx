import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function DetectedQuestion() {
  const { currentQuestion } = useAppStore();
  return <div style={{color:'#fff'}}>{currentQuestion || 'Waiting for question...'}</div>;
}