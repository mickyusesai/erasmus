import { useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';

interface SwipeableCardDeckProps<T extends { id: string }> {
  items: T[];
  onSwipeRight: (item: T) => void;
  onSwipeLeft: (item: T) => void;
  renderCard: (item: T) => React.ReactNode;
  allDone: React.ReactNode;
  totalCount: number;
  confirmedCount: number;
}

export function SwipeableCardDeck<T extends { id: string }>({
  items,
  onSwipeRight,
  onSwipeLeft,
  renderCard,
  allDone,
  totalCount,
  confirmedCount,
}: SwipeableCardDeckProps<T>) {
  const [exitDirection, setExitDirection] = useState<'right' | 'left'>('right');

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const confirmOpacity = useTransform(x, [30, 100], [0, 1]);
  const editOpacity = useTransform(x, [-100, -30], [1, 0]);

  if (items.length === 0) {
    return (
      <div>
        <ProgressBar total={totalCount} confirmed={confirmedCount} remaining={0} />
        <div className="mt-4">{allDone}</div>
      </div>
    );
  }

  const topItem = items[0];
  const behindItems = items.slice(1, 3);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > 80) {
      setExitDirection('right');
      onSwipeRight(topItem);
    } else if (info.offset.x < -80) {
      onSwipeLeft(topItem);
    }
  };

  return (
    <div>
      <ProgressBar total={totalCount} confirmed={confirmedCount} remaining={items.length} />

      <div className="relative mt-4" style={{ height: '420px' }}>
        {/* Behind cards (static, slightly scaled down and offset) */}
        {[...behindItems].reverse().map((item, i) => {
          const depth = behindItems.length - i;
          return (
            <div
              key={item.id}
              className="absolute inset-0 bg-white rounded-3xl shadow-md overflow-hidden"
              style={{
                transform: `scale(${1 - depth * 0.04}) translateY(${depth * 12}px)`,
                zIndex: behindItems.length - depth,
                transformOrigin: 'bottom center',
              }}
            >
              <div className="opacity-60 pointer-events-none select-none">
                {renderCard(item)}
              </div>
            </div>
          );
        })}

        {/* Top card — draggable */}
        <AnimatePresence>
          <motion.div
            key={topItem.id}
            className="absolute inset-0 bg-white rounded-3xl shadow-lg overflow-hidden cursor-grab active:cursor-grabbing"
            style={{ x, rotate, zIndex: 10 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { duration: 0.2 } }}
            exit={
              exitDirection === 'right'
                ? { x: 600, opacity: 0, rotate: 30, transition: { duration: 0.28, ease: 'easeOut' } }
                : { x: -600, opacity: 0, rotate: -30, transition: { duration: 0.28, ease: 'easeOut' } }
            }
          >
            {renderCard(topItem)}

            {/* "DONE ✓" green overlay — appears while dragging right */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center rounded-3xl bg-emerald-400/25 pointer-events-none"
              style={{ opacity: confirmOpacity }}
            >
              <div className="bg-emerald-500 text-white font-bold text-2xl px-7 py-3 rounded-2xl shadow-lg"
                style={{ transform: 'rotate(-12deg)' }}
              >
                DONE ✓
              </div>
            </motion.div>

            {/* "EDIT ✎" amber overlay — appears while dragging left */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center rounded-3xl bg-amber-400/25 pointer-events-none"
              style={{ opacity: editOpacity }}
            >
              <div className="bg-amber-500 text-white font-bold text-2xl px-7 py-3 rounded-2xl shadow-lg"
                style={{ transform: 'rotate(12deg)' }}
              >
                EDIT ✎
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Swipe hints */}
      <div className="flex items-center justify-between mt-3 px-2 text-xs text-gray-400 select-none">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-sm">✎</div>
          <span>Edit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Confirm</span>
          <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-sm">✓</div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  total,
  confirmed,
  remaining,
}: {
  total: number;
  confirmed: number;
  remaining: number;
}) {
  const pct = total > 0 ? (confirmed / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium text-gray-700">
          {confirmed} / {total} confirmed
        </span>
        <span className="text-gray-400">{remaining} left to review</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500 rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
