import { Plane, Train, Bus, Car, Ship, HelpCircle, FileText, Calendar, MapPin, Repeat } from 'lucide-react';
import { TravelItem, TransportMode } from '../../services/api';
import { clsx } from 'clsx';

const transportIcons: Record<TransportMode, React.ElementType> = {
  PLANE: Plane,
  TRAIN: Train,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: HelpCircle,
};

const transportBadgeColors: Record<TransportMode, string> = {
  PLANE: 'bg-sky-100 text-sky-700',
  TRAIN: 'bg-emerald-100 text-emerald-700',
  BUS: 'bg-violet-100 text-violet-700',
  CAR: 'bg-amber-100 text-amber-700',
  FERRY: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

function formatDate(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function TravelItemReviewCard({ item }: { item: TravelItem }) {
  const Icon = transportIcons[item.modeOfTransport] || HelpCircle;
  const badgeClass = transportBadgeColors[item.modeOfTransport] || 'bg-gray-100 text-gray-700';
  const isNonEur = item.currencyOriginal !== 'EUR';
  const totalEur = (item.amountEur || 0) + (item.luggageAmountEur || 0);

  return (
    <div className="h-full flex flex-col p-6 select-none">
      {/* Header row: transport badge + round-trip badge */}
      <div className="flex items-center justify-between mb-5">
        <div className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium', badgeClass)}>
          <Icon className="w-4 h-4" />
          <span>{item.modeOfTransport.charAt(0) + item.modeOfTransport.slice(1).toLowerCase()}</span>
        </div>
        {item.amountIncludedInRoundTrip && (
          <div className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
            <Repeat className="w-3 h-3" />
            Included in round-trip
          </div>
        )}
      </div>

      {/* Route — main visual */}
      <div className="flex-1 flex flex-col justify-center space-y-3">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-2xl text-gray-900 leading-tight">{item.fromLocation || '—'}</span>
              <span className="text-gray-400 text-xl">→</span>
              <span className="font-bold text-2xl text-gray-900 leading-tight">{item.toLocation || '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-8 text-sm text-gray-500">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{formatDate(item.departureDate)}</span>
          {item.flightNumber && (
            <span className="text-gray-400">· {item.flightNumber}</span>
          )}
          {item.companyName && (
            <span className="text-gray-400">· {item.companyName}</span>
          )}
        </div>
      </div>

      {/* Amount card */}
      <div className={clsx(
        'mt-4 p-4 rounded-2xl',
        item.amountIncludedInRoundTrip ? 'bg-purple-50' : 'bg-gray-50'
      )}>
        {item.amountIncludedInRoundTrip ? (
          <p className="text-sm font-medium text-purple-700 text-center">
            Price counted on the outbound leg
          </p>
        ) : (
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Amount (EUR)</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalEur)}</p>
              {item.luggageAmountEur ? (
                <p className="text-xs text-sky-600 mt-0.5">incl. luggage</p>
              ) : null}
            </div>
            {isNonEur && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">Original</p>
                <p className="text-sm font-medium text-gray-600">
                  {formatCurrency(item.amountOriginal, item.currencyOriginal)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document link status */}
      <div className="mt-3 flex items-center gap-2">
        <FileText className={clsx('w-4 h-4 flex-shrink-0', item.documentId ? 'text-emerald-500' : 'text-amber-400')} />
        <span className={clsx('text-xs', item.documentId ? 'text-emerald-600' : 'text-amber-600')}>
          {item.documentId ? 'Document linked' : 'No document — add in edit'}
        </span>
      </div>
    </div>
  );
}
