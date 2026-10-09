import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function LiveStatusBar() {
  const { status } = useAppStore();
  
  return (
    <div style={{ padding: '12px 24px', borderBottom: '1px solid #2d2b3b', background: '#0a0a0f', color: '#fff' }}>
      ● {status.toUpperCase()}
    </div>
  );
}