import React, { useState, useRef, useEffect } from "react";
import { Lock, X, CheckCircle, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { MADAM_LIM_REVIEW_PASSCODE } from "../types";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (passcode: string) => Promise<boolean>;
  title: string;
  children: React.ReactNode;
}

export default function ReviewModal({ isOpen, onClose, onVerify, title, children }: ReviewModalProps) {
  const [passcode, setPasscode] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPasscode("");
      setError("");
      // Automatically focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleVerify = async () => {
    const normalized = String(passcode ?? "").replace(/\D/g, "").slice(0, 4);
    setLoading(true);
    setError("");
    
    // Check locally and via onVerify handler
    const isLocalValid = normalized === MADAM_LIM_REVIEW_PASSCODE;
    const success = isLocalValid || (await onVerify(normalized));
    
    if (success) {
      setIsVerified(true);
      setPasscode("");
      setError("");
    } else {
      setError("Invalid passcode. Please try again.");
      setPasscode("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] lg:max-w-7xl overflow-hidden flex flex-col max-h-[95vh]"
      >
        <div className="bg-slate-900 text-white px-6 py-6 flex justify-between items-center shrink-0">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black tracking-tight leading-none uppercase">{title}</h2>
            <p className="text-[10px] tracking-widest text-slate-400 font-bold uppercase mt-1">Authorised Human Review Action</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors border-2 border-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!isVerified ? (
            <div className="max-w-md mx-auto py-12 text-center">
              <div className="mb-6 inline-flex p-5 bg-slate-100 text-slate-900 rounded-2xl border-2 border-slate-200 shadow-inner">
                <Lock className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Madam Lim's Access Only</h3>
              <p className="text-slate-500 font-medium mb-10 leading-relaxed">
                This secure action requires authorisation. Please provide your unique 4-digit passcode to proceed with document correction or matching override.
              </p>
              
              <div className="flex flex-col gap-5">
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  value={passcode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setPasscode(digits);
                  }}
                  placeholder="••••"
                  className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-center text-4xl font-black tracking-[1em] focus:border-blue-600 focus:outline-none transition-all shadow-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                />
                {error && <div className="text-red-600 text-xs flex items-center justify-center gap-2 font-black uppercase tracking-wider"><AlertCircle className="w-4 h-4" /> {error}</div>}
                <button
                  onClick={handleVerify}
                  disabled={loading || passcode.length < 4}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50 shadow-xl shadow-blue-600/20"
                >
                  {loading ? "Verifying..." : "Verify Authorisation"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded flex items-center gap-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
                <span className="text-emerald-800 font-serif italic text-lg leading-tight">Verified: Welcome, Madam Lim. You are now authorised to make corrections and overrides.</span>
              </div>
              {children}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
