import { useEffect } from 'react';
import { X } from 'lucide-react';

/** The 35-second film: from a pile of tickets to a paid participant */
export function FilmModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <p className="text-white font-medium">From a pile of tickets to a paid participant</p>
          <button onClick={onClose} className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10" aria-label="Close the film">
            <X className="w-5 h-5" />
          </button>
        </div>
        <video
          src="/film/how-it-works.mp4"
          poster="/film/how-it-works-poster.webp"
          controls
          autoPlay
          playsInline
          className="w-full rounded-2xl bg-black shadow-elevated"
        />
      </div>
    </div>
  );
}
