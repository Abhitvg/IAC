import React from 'react';
import { useAppStore } from '../store/useAppStore';

export default function Toast() {
  const { toast } = useAppStore();

  if (!toast) return null;

  return (
    <div className="toast">
      {toast}
    </div>
  );
}
