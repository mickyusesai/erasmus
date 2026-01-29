import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Eraser } from 'lucide-react';
import { Button } from '../ui/Button';

interface SignaturePadProps {
  onSignatureChange?: (dataUrl: string | null) => void;
  className?: string;
}

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignatureChange, className }, ref) => {
    const signatureRef = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        signatureRef.current?.clear();
        onSignatureChange?.(null);
      },
      isEmpty: () => signatureRef.current?.isEmpty() ?? true,
      toDataURL: () => signatureRef.current?.toDataURL() ?? '',
    }));

    const handleEnd = () => {
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        onSignatureChange?.(signatureRef.current.toDataURL());
      }
    };

    const handleClear = () => {
      signatureRef.current?.clear();
      onSignatureChange?.(null);
    };

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        // The canvas needs to be cleared and resized properly
        // This is a limitation of react-signature-canvas
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
      <div className={className}>
        <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
          <SignatureCanvas
            ref={signatureRef}
            canvasProps={{
              className: 'w-full h-40 cursor-crosshair',
              style: { width: '100%', height: '160px' },
            }}
            backgroundColor="white"
            penColor="black"
            onEnd={handleEnd}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">Draw your signature above</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClear}
          >
            <Eraser className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';
