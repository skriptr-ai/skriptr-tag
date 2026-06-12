/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store';

const COLOR_OPTIONS = [
  { value: '#ff0055', label: 'NEON PINK' },
  { value: '#00ff00', label: 'CYBER GREEN' },
  { value: '#ffff00', label: 'SOLAR YELLOW' },
  { value: '#ff00ff', label: 'PLASMA MAGENTA' },
  { value: '#00ffff', label: 'NEXUS CYAN' }
];

export function ProfileCustomization() {
  const userProfile = useGameStore(state => state.userProfile);
  const updateProfile = useGameStore(state => state.updateProfile);
  const logout = useGameStore(state => state.logout);

  const [displayName, setDisplayName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#00ffff');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Initialize fields from profile state
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || '');
      setSelectedColor(userProfile.color || '#00ffff');
    }
  }, [userProfile]);

  if (!userProfile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      await updateProfile(displayName.trim().substring(0, 16), selectedColor);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-xl p-6 rounded-2xl border border-cyan-500/20 bg-black/60 backdrop-blur-md flex flex-col gap-6 font-mono text-cyan-400 select-none shadow-[0_0_30px_rgba(6,182,212,0.1)]">
      
      {/* Widget Title */}
      <div className="flex justify-between items-center border-b border-cyan-500/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
          <h2 className="text-md font-black tracking-widest uppercase">
            OPERATOR PROFILE
          </h2>
        </div>
        <button
          onClick={logout}
          className="px-2.5 py-1 text-[10px] font-bold border border-red-500/30 text-red-400/80 hover:text-red-400 hover:border-red-500 hover:bg-red-500/10 rounded transition-all duration-200 uppercase tracking-widest cursor-pointer"
        >
          DISCONNECT ID
        </button>
      </div>

      {/* Stats Display Panel */}
      <div className="grid grid-cols-2 gap-4">
        {/* Solo Highscore Card */}
        <div className="p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5 flex flex-col gap-1 items-center text-center">
          <span className="text-[10px] text-cyan-400/50 font-black tracking-widest uppercase">
            SOLO ALL-TIME HIGH
          </span>
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
            {userProfile.highScoreSinglePlayer.toString().padStart(4, '0')}
          </span>
          <span className="text-[8px] text-gray-500 font-bold uppercase mt-0.5">POINTS</span>
        </div>

        {/* Multiplayer games won Card */}
        <div className="p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5 flex flex-col gap-1 items-center text-center">
          <span className="text-[10px] text-cyan-400/50 font-black tracking-widest uppercase">
            SECTOR VICTORIES
          </span>
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]">
            {userProfile.onlineGamesWon.toString().padStart(2, '0')}
          </span>
          <span className="text-[8px] text-gray-500 font-bold uppercase mt-0.5">MATCHES WON</span>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {/* Gaming Code Display Name Input */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black tracking-widest text-cyan-400/60 uppercase">
            OPERATOR CODE (GAMING ALIAS)
          </label>
          <input 
            type="text"
            required
            maxLength={16}
            placeholder="ENTER IDENTITY ALIAS"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2.5 bg-black/60 border border-cyan-500/20 rounded-xl text-cyan-400 focus:outline-none focus:border-cyan-400 font-mono tracking-wide placeholder-cyan-950 text-sm"
          />
        </div>

        {/* Laser Weapon Beam Color Picker */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black tracking-widest text-cyan-400/60 uppercase">
            LASER BEAM SPECTRUM
          </label>
          <div className="flex flex-wrap gap-2.5">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedColor(opt.value)}
                className={`px-3 py-2 text-[10px] font-bold rounded-lg border transition-all duration-200 uppercase flex items-center gap-2 cursor-pointer ${
                  selectedColor === opt.value
                    ? 'border-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                    : 'border-cyan-500/20 text-cyan-400/60 hover:border-cyan-500/40 hover:text-cyan-400'
                }`}
                style={{
                  backgroundColor: selectedColor === opt.value ? opt.value : 'transparent'
                }}
              >
                <span 
                  className={`w-2 h-2 rounded-full border border-black/40 ${selectedColor === opt.value ? 'bg-black' : ''}`}
                  style={{ backgroundColor: selectedColor === opt.value ? 'transparent' : opt.value }}
                />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Update Save Button */}
        <div className="flex items-center gap-4 mt-1">
          <button
            type="submit"
            disabled={isSaving}
            className={`flex-1 py-3 px-6 text-xs font-black tracking-widest rounded-xl border transition-all duration-200 active:scale-95 uppercase ${
              isSaving
                ? 'bg-transparent border-cyan-500/20 text-cyan-400/40 cursor-not-allowed'
                : 'bg-cyan-500/10 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] cursor-pointer'
            }`}
          >
            {isSaving ? 'UPDATING COUPLING...' : 'SAVE CONFIGURATION'}
          </button>

          {/* Toast / save state display */}
          {saveStatus === 'success' && (
            <span className="text-[10px] font-black text-green-400 tracking-wider animate-pulse uppercase">
              ✓ COMPILATION SAVED
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-[10px] font-black text-red-500 tracking-wider animate-pulse uppercase">
              ✗ SAVE FAILURE
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
