import React from 'react';

export default function GlassCard({ children, className = '', ...props }) {
  return (
    <div className={`therapy-card ${className}`} {...props}>
      {children}
    </div>
  );
}
