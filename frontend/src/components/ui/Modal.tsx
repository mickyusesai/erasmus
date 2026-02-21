import { Fragment, ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  zIndex?: number;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', zIndex }: ModalProps) {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const backdropZ = zIndex ? `z-[${zIndex}]` : 'z-40';
  const modalZ = zIndex ? `z-[${zIndex + 10}]` : 'z-50';

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className={clsx('fixed inset-0 bg-black/50 animate-fadeIn', backdropZ)}
        style={zIndex ? { zIndex } : undefined}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={clsx('fixed inset-0 flex items-center justify-center p-4', modalZ)}
        style={zIndex ? { zIndex: zIndex + 10 } : undefined}
      >
        <div
          className={clsx(
            'w-full bg-white rounded-2xl shadow-elevated animate-fadeIn flex flex-col max-h-[90vh]',
            sizes[size]
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="p-6 overflow-y-auto">{children}</div>
        </div>
      </div>
    </Fragment>
  );
}
