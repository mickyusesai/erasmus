import { useRef, forwardRef, useImperativeHandle } from 'react';
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

    return (
      <div className={className}>
        <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
          {/* clearOnResize must stay off: mobile browsers fire window resize when
              the URL bar collapses while scrolling, which would silently wipe the
              drawn signature mid-form. */}
          <SignatureCanvas
            ref={signatureRef}
            clearOnResize={false}
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
