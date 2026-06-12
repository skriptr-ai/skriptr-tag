/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useGameStore } from '../store';

export function LoginScreen() {
  const login = useGameStore(state => state.login);
  const authLoading = useGameStore(state => state.authLoading);
  const authError = useGameStore(state => state.authError);

  return (
    <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50 px-4 select-none font-mono">
      {/* Dynamic Cyber Grid Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)',
        backgroundSize: '32px 32px'
      }} />

      {/* Futuristic scanner glow */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-[scan_6s_linear_infinite]" style={{
        animation: 'scanner-line 4s linear infinite'
      }} />

      <style>{`
        @keyframes scanner-line {
          0% { top: 0%; opacity: 0.1; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0.1; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 15px rgba(6, 182, 212, 0.15); }
          50% { box-shadow: 0 0 30px rgba(6, 182, 212, 0.35); }
        }
      `}</style>

      {/* Main Glassmorphic Container */}
      <div 
        className="relative max-w-md w-full p-8 rounded-3xl border-2 border-cyan-500/20 bg-black/75 backdrop-blur-xl flex flex-col items-center gap-6 transition-all duration-300 shadow-[0_0_30px_rgba(6,182,212,0.1)]"
        style={{
          animation: 'glow-pulse 4s infinite ease-in-out'
        }}
      >
        {/* Terminal Corner Accents */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-400/40" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400/40" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-400/40" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-400/40" />

        {/* Header Icon & Brand */}
        <div className="flex flex-col items-center gap-2">
          {/* Cybernetic Core icon */}
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 border border-cyan-400/20 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-1 border border-dashed border-cyan-400/40 rounded-full animate-[spin_15s_linear_infinite]" />
            <div className="absolute inset-3 border-2 border-cyan-400 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.4)]">
              <span className="text-cyan-400 font-black text-xl">⚡</span>
            </div>
          </div>

          <div className="text-center mt-2">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-cyan-400 tracking-wider uppercase drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
              SKRIPTR TAG
            </h1>
            <p className="text-cyan-400/50 text-[10px] font-bold tracking-widest uppercase mt-1">
              [ Grid Security Terminal ]
            </p>
          </div>
        </div>

        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

        {/* Information Notice */}
        <div className="text-center text-xs text-gray-400 leading-relaxed font-semibold uppercase tracking-wide bg-cyan-950/10 border border-cyan-500/10 px-4 py-3 rounded-2xl w-full">
          🔐 Authorized clearance required.
          <div className="text-[10px] text-cyan-400/70 mt-1">
            Access strictly restricted to <span className="text-yellow-400 font-bold">@skriptr</span> domains.
          </div>
        </div>

        {/* Auth Error Display */}
        {authError && (
          <div className="w-full p-4 bg-red-950/20 border border-red-500/40 rounded-2xl text-center flex flex-col gap-1.5 animate-pulse">
            <span className="text-xs font-black text-red-400 uppercase tracking-widest">
              SYSTEM DENIAL
            </span>
            <p className="text-[10px] text-red-300 font-semibold uppercase leading-normal">
              {authError}
            </p>
          </div>
        )}

        {/* Trigger SSO Button */}
        <button
          disabled={authLoading}
          onClick={login}
          className={`w-full py-4 px-6 text-sm font-black tracking-widest rounded-xl border-2 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-3 select-none ${
            authLoading
              ? 'bg-transparent border-cyan-500/20 text-cyan-400/40 cursor-not-allowed'
              : 'bg-cyan-500/10 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] shadow-[0_0_10px_rgba(34,211,238,0.1)] cursor-pointer'
          }`}
        >
          {authLoading ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>DECRYPTING SESSION...</span>
            </div>
          ) : (
            <>
              {/* Custom Retro Google G Icon (SVG) */}
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-6.887 4.114-4.647 0-8.4-3.753-8.4-8.4s3.753-8.4 8.4-8.4c2.25 0 4.185.836 5.64 2.307l3.12-3.12C18.96 1.106 15.84 0 12.24 0 5.58 0 0 5.58 0 12.24s5.58 12.24 12.24 12.24c6.84 0 12.24-4.815 12.24-12.24 0-.756-.075-1.5-.216-2.205H12.24z"/>
              </svg>
              <span>IDENTITY SIGN IN (SSO)</span>
            </>
          )}
        </button>

        {/* Footer info */}
        <div className="text-[10px] text-gray-500 uppercase tracking-widest text-center mt-2 flex items-center gap-1.5 select-none">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span>Encryption Protocol Active</span>
        </div>
      </div>
    </div>
  );
}
